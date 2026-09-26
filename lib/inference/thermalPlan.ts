/**
 * Hardware-aware runtime planning for local GGUF inference.
 *
 * The Snapdragon 8 Gen 3 in the ROG Phone 8 Pro sustains a much higher token
 * rate when it is cool than when it is throttling, and Android will kill the
 * app outright rather than let it hold a large context under memory pressure.
 * A fixed `n_threads` / `n_gpu_layers` pair is therefore wrong most of the
 * time: too timid when the device is cold, too aggressive when it is hot.
 *
 * This module is deliberately pure. It turns an observed device state into a
 * runtime plan and nothing else, so the mapping is unit-testable and the
 * caller stays responsible for actually reading the platform values. It never
 * invents a reading: an absent signal stays absent and the plan says so.
 */

/**
 * Mirrors `android.os.PowerManager.getCurrentThermalStatus()`.
 * This is the OS's own throttling verdict and is available without root.
 */
export enum ThermalStatus {
  None = 0,
  Light = 1,
  Moderate = 2,
  Severe = 3,
  Critical = 4,
  Emergency = 5,
  Shutdown = 6,
}

export type RuntimeTier = 'overdrive' | 'full' | 'balanced' | 'conservative' | 'survival';

export interface DevicePowerState {
  /** From PowerManager. Undefined when the platform has not reported yet. */
  thermalStatus?: ThermalStatus;
  /** 0..1 from ACTION_BATTERY_CHANGED. Undefined when unknown. */
  batteryLevel?: number;
  /** True when plugged in. Undefined when unknown. */
  charging?: boolean;
  /**
   * True only when an external cooler (AeroActive) has actually been detected.
   * Never assume this: an undetected cooler must read as undefined, not false
   * confidence in extra headroom.
   */
  coolerAttached?: boolean;
  /** Physical RAM in GiB, when the platform reports it. */
  totalRamGb?: number;
}

export interface RuntimePlan {
  threads: number;
  gpuLayers: number;
  contextSize: number;
  batchSize: number;
  tier: RuntimeTier;
  /** Human-readable justification, shown in Settings diagnostics. */
  reason: string;
  /** True when the plan was derived from a real thermal reading. */
  thermalSignalPresent: boolean;
}

/**
 * Snapdragon 8 Gen 3 is 1 prime + 5 performance + 2 efficiency cores.
 * Scheduling llama.cpp across all eight fights the OS for the efficiency pair
 * and measurably raises skin temperature for very little extra throughput, so
 * six is the ceiling unless active cooling is confirmed.
 */
const MAX_THREADS_PASSIVE = 6;
const MAX_THREADS_ACTIVE_COOLING = 8;

/**
 * RAM at or above which a doubled context is affordable. The ROG Phone 8 Pro
 * ships 16 GB; 12 is the threshold because a 12 GB device clears the model,
 * the KV cache and Android's own footprint with room to spare, and anything
 * below that is where an OS kill starts to be a real risk.
 */
const GENEROUS_RAM_GB = 12;
const LARGE_CONTEXT = 8192;

const TIERS: Record<RuntimeTier, Omit<RuntimePlan, 'reason' | 'tier' | 'thermalSignalPresent'>> = {
  overdrive: { threads: MAX_THREADS_ACTIVE_COOLING, gpuLayers: 99, contextSize: 8192, batchSize: 512 },
  full: { threads: MAX_THREADS_PASSIVE, gpuLayers: 99, contextSize: 4096, batchSize: 512 },
  balanced: { threads: 4, gpuLayers: 99, contextSize: 4096, batchSize: 256 },
  conservative: { threads: 3, gpuLayers: 24, contextSize: 2048, batchSize: 128 },
  survival: { threads: 2, gpuLayers: 0, contextSize: 1536, batchSize: 64 },
};

function tierForThermal(status: ThermalStatus): RuntimeTier {
  if (status >= ThermalStatus.Critical) return 'survival';
  if (status === ThermalStatus.Severe) return 'conservative';
  if (status === ThermalStatus.Moderate) return 'balanced';
  return 'full';
}

const TIER_ORDER: RuntimeTier[] = ['overdrive', 'full', 'balanced', 'conservative', 'survival'];

/** Returns whichever tier is more cautious. */
function stricter(a: RuntimeTier, b: RuntimeTier): RuntimeTier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

/**
 * Derives a runtime plan from the observed device state.
 *
 * With no signals at all the plan is `full`, matching the previous fixed
 * defaults, and `thermalSignalPresent` is false so the UI can say "not
 * measured" rather than implying the device was checked.
 */
export function planRuntime(device: DevicePowerState = {}): RuntimePlan {
  const thermalSignalPresent = typeof device.thermalStatus === 'number';
  const reasons: string[] = [];

  let tier: RuntimeTier = 'full';

  if (typeof device.thermalStatus === 'number') {
    tier = tierForThermal(device.thermalStatus);
    if (tier !== 'full') {
      reasons.push(`thermal status ${ThermalStatus[device.thermalStatus] ?? device.thermalStatus}`);
    }
  } else {
    reasons.push('no thermal reading yet');
  }

  // Active cooling only unlocks overdrive from an otherwise unthrottled state.
  // A hot device with a cooler attached is still a hot device.
  if (device.coolerAttached === true && tier === 'full') {
    tier = 'overdrive';
    reasons.push('active cooler detected');
  }

  // A nearly flat battery off charge cannot sustain peak draw, and Android
  // aggressively reclaims memory in that state.
  if (typeof device.batteryLevel === 'number' && device.batteryLevel <= 0.15 && device.charging !== true) {
    tier = stricter(tier, 'conservative');
    reasons.push(`battery ${Math.round(device.batteryLevel * 100)}% and not charging`);
  }

  // Low-RAM devices cannot hold a large context without risking an OS kill.
  if (typeof device.totalRamGb === 'number' && device.totalRamGb < 8) {
    tier = stricter(tier, 'balanced');
    reasons.push(`${device.totalRamGb} GB RAM`);
  }

  const base = TIERS[tier];
  let { contextSize } = base;

  // The rule above was one-directional: plenty of RAM bought nothing. On a
  // 16 GB ROG Phone 8 Pro holding a 4B Q4 model, the KV cache for a doubled
  // context is on the order of hundreds of megabytes — trivially affordable,
  // and the difference between an assistant that remembers this conversation
  // and one that forgets the start of it.
  //
  // Deliberately only the context grows. Threads and GPU layers are a heat
  // decision and stay governed by the thermal tier; context is a memory
  // decision. And it applies only while thermals are unthrottled, so a hot
  // phone is never handed a bigger working set.
  if (
    typeof device.totalRamGb === 'number' &&
    device.totalRamGb >= GENEROUS_RAM_GB &&
    (tier === 'full' || tier === 'overdrive')
  ) {
    contextSize = Math.max(contextSize, LARGE_CONTEXT);
    reasons.push(`${device.totalRamGb} GB RAM allows a ${LARGE_CONTEXT} context`);
  }

  return {
    ...base,
    contextSize,
    tier,
    thermalSignalPresent,
    reason: reasons.length > 0 ? reasons.join('; ') : 'device cool and unconstrained',
  };
}

/**
 * True when moving from `previous` to `next` is worth paying for.
 *
 * Reloading a llama.rn context costs seconds, so a plan is only re-applied
 * when it actually changes the thread count or offload depth. Throttling down
 * is always applied immediately; recovering upward is applied too, but callers
 * should debounce it so a device hovering on a tier boundary does not thrash.
 */
export function planRequiresReload(previous: RuntimePlan | null, next: RuntimePlan): boolean {
  if (!previous) return true;
  return (
    previous.threads !== next.threads ||
    previous.gpuLayers !== next.gpuLayers ||
    previous.contextSize !== next.contextSize
  );
}

/** True when `next` is more cautious than `previous` (heat is rising). */
export function isThrottlingDown(previous: RuntimePlan | null, next: RuntimePlan): boolean {
  if (!previous) return false;
  return TIER_ORDER.indexOf(next.tier) > TIER_ORDER.indexOf(previous.tier);
}
