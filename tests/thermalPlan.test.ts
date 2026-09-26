import { describe, expect, it } from 'vitest';
import {
  ThermalStatus,
  isThrottlingDown,
  planRequiresReload,
  planRuntime,
} from '@/lib/inference/thermalPlan';

describe('planRuntime', () => {
  it('reports that no thermal reading was taken instead of implying a cool device', () => {
    const plan = planRuntime({});
    expect(plan.thermalSignalPresent).toBe(false);
    expect(plan.reason).toContain('no thermal reading');
    // Falls back to the previous fixed defaults rather than guessing.
    expect(plan.tier).toBe('full');
    expect(plan.threads).toBe(6);
  });

  it('runs at full offload while the device is unthrottled', () => {
    const plan = planRuntime({ thermalStatus: ThermalStatus.None });
    expect(plan.tier).toBe('full');
    expect(plan.gpuLayers).toBe(99);
    expect(plan.thermalSignalPresent).toBe(true);
  });

  it('steps down progressively as the SoC heats up', () => {
    const moderate = planRuntime({ thermalStatus: ThermalStatus.Moderate });
    const severe = planRuntime({ thermalStatus: ThermalStatus.Severe });
    const critical = planRuntime({ thermalStatus: ThermalStatus.Critical });

    expect(moderate.threads).toBeLessThan(6);
    expect(severe.threads).toBeLessThan(moderate.threads);
    expect(critical.threads).toBeLessThan(severe.threads);
    expect(severe.contextSize).toBeLessThan(moderate.contextSize);
    // Last resort keeps the model answering on CPU only.
    expect(critical.gpuLayers).toBe(0);
  });

  it('treats Emergency and Shutdown as at least as severe as Critical', () => {
    for (const status of [ThermalStatus.Emergency, ThermalStatus.Shutdown]) {
      expect(planRuntime({ thermalStatus: status }).tier).toBe('survival');
    }
  });

  it('unlocks overdrive only when a cooler is detected on a cool device', () => {
    const plan = planRuntime({ thermalStatus: ThermalStatus.None, coolerAttached: true });
    expect(plan.tier).toBe('overdrive');
    expect(plan.threads).toBe(8);
    expect(plan.contextSize).toBe(8192);
  });

  it('does not let an attached cooler override an already-throttling device', () => {
    const plan = planRuntime({ thermalStatus: ThermalStatus.Severe, coolerAttached: true });
    expect(plan.tier).toBe('conservative');
  });

  it('never assumes a cooler that was not detected', () => {
    expect(planRuntime({ thermalStatus: ThermalStatus.None }).tier).toBe('full');
    expect(planRuntime({ thermalStatus: ThermalStatus.None, coolerAttached: false }).tier).toBe('full');
  });

  it('conserves on a nearly flat battery that is not charging', () => {
    const plan = planRuntime({ thermalStatus: ThermalStatus.None, batteryLevel: 0.1, charging: false });
    expect(plan.tier).toBe('conservative');
    expect(plan.reason).toContain('not charging');
  });

  it('ignores a low battery that is charging', () => {
    const plan = planRuntime({ thermalStatus: ThermalStatus.None, batteryLevel: 0.1, charging: true });
    expect(plan.tier).toBe('full');
  });

  it('caps context on a device with limited RAM', () => {
    const plan = planRuntime({ thermalStatus: ThermalStatus.None, totalRamGb: 6 });
    expect(plan.tier).toBe('balanced');
  });

  it('applies the strictest applicable constraint when several apply', () => {
    const plan = planRuntime({
      thermalStatus: ThermalStatus.Severe,
      batteryLevel: 0.05,
      charging: false,
      totalRamGb: 6,
    });
    expect(plan.tier).toBe('conservative');
  });
});

describe('planRequiresReload', () => {
  it('always loads when there is no previous plan', () => {
    expect(planRequiresReload(null, planRuntime({}))).toBe(true);
  });

  it('does not reload when the runtime parameters are unchanged', () => {
    const a = planRuntime({ thermalStatus: ThermalStatus.None });
    const b = planRuntime({ thermalStatus: ThermalStatus.Light });
    expect(planRequiresReload(a, b)).toBe(false);
  });

  it('reloads when the thread count or offload depth changes', () => {
    const cool = planRuntime({ thermalStatus: ThermalStatus.None });
    const hot = planRuntime({ thermalStatus: ThermalStatus.Severe });
    expect(planRequiresReload(cool, hot)).toBe(true);
  });
});

describe('isThrottlingDown', () => {
  it('detects a move to a more cautious tier', () => {
    const cool = planRuntime({ thermalStatus: ThermalStatus.None });
    const hot = planRuntime({ thermalStatus: ThermalStatus.Severe });
    expect(isThrottlingDown(cool, hot)).toBe(true);
    expect(isThrottlingDown(hot, cool)).toBe(false);
  });

  it('is false with no previous plan', () => {
    expect(isThrottlingDown(null, planRuntime({}))).toBe(false);
  });
});

describe('memory headroom on a 16 GB ROG Phone 8 Pro', () => {
  it('raises the context when RAM is generous and the device is cool', () => {
    const plan = planRuntime({ thermalStatus: ThermalStatus.None, totalRamGb: 16 });
    expect(plan.contextSize).toBe(8192);
    expect(plan.tier).toBe('full');
    // Threads and GPU layers are a heat decision, not a memory one.
    expect(plan.threads).toBe(6);
    expect(plan.reason).toContain('16 GB RAM allows');
  });

  it('does not hand a throttling device a bigger working set', () => {
    for (const status of [ThermalStatus.Moderate, ThermalStatus.Severe, ThermalStatus.Critical]) {
      const plan = planRuntime({ thermalStatus: status, totalRamGb: 16 });
      expect(plan.contextSize, ThermalStatus[status]).toBeLessThanOrEqual(4096);
    }
  });

  it('leaves an ordinary phone exactly where it was', () => {
    expect(planRuntime({ thermalStatus: ThermalStatus.None, totalRamGb: 8 }).contextSize).toBe(4096);
    expect(planRuntime({ thermalStatus: ThermalStatus.None }).contextSize).toBe(4096);
  });

  it('still shrinks the context on a low-RAM device', () => {
    const plan = planRuntime({ thermalStatus: ThermalStatus.None, totalRamGb: 6 });
    expect(plan.tier).toBe('balanced');
    expect(plan.contextSize).toBe(4096);
  });

  it('does not claim a thermal reading it never had', () => {
    expect(planRuntime({ totalRamGb: 16 }).thermalSignalPresent).toBe(false);
  });
});
