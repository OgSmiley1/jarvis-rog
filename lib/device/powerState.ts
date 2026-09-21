/**
 * Reads the device power signals that drive local inference sizing.
 *
 * Every value here comes from a real platform API. When a signal cannot be
 * read, it is returned as `undefined` and the reason is recorded, because
 * `planRuntime` treats an absent reading as "not measured" rather than as a
 * cool, unconstrained device. Nothing in this module estimates or substitutes
 * a value it did not actually observe.
 */

import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import { getCurrentThermalStatus, isThermalStatusSupported } from 'expo-thermal-status';
import { Platform } from 'react-native';
import { ThermalStatus, type DevicePowerState } from '@/lib/inference/thermalPlan';

export interface PowerStateReading {
  state: DevicePowerState;
  /** Signals that could not be read, and why. Surfaced in Settings diagnostics. */
  unavailable: string[];
}

const BYTES_PER_GIB = 1024 ** 3;

/**
 * Android's own throttling verdict lives on
 * `PowerManager.getCurrentThermalStatus()` (API 29+), bridged by the local
 * `expo-thermal-status` module under `modules/`.
 *
 * Battery temperature is deliberately NOT used as a stand-in: it measures the
 * pack, not the SoC, and on the ROG Phone 8 Pro it lags the Snapdragon by a
 * wide margin under load. Substituting it would mean throttling on a number
 * that does not describe the thing being throttled.
 */
function readThermalStatus(unavailable: string[]): ThermalStatus | undefined {
  if (!isThermalStatusSupported()) {
    unavailable.push('Thermal status unsupported: needs Android 10 (API 29) or newer.');
    return undefined;
  }

  const raw = getCurrentThermalStatus();
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < ThermalStatus.None || raw > ThermalStatus.Shutdown) {
    unavailable.push('Thermal status unreadable from PowerManager.');
    return undefined;
  }

  return raw as ThermalStatus;
}

export async function readDevicePowerState(): Promise<PowerStateReading> {
  const state: DevicePowerState = {};
  const unavailable: string[] = [];

  const thermalStatus = readThermalStatus(unavailable);
  if (thermalStatus !== undefined) state.thermalStatus = thermalStatus;

  try {
    const level = await Battery.getBatteryLevelAsync();
    // The platform returns -1 when the level is genuinely unknown.
    if (level >= 0 && level <= 1) state.batteryLevel = level;
    else unavailable.push('Battery level reported as unknown by the platform.');
  } catch (error) {
    unavailable.push(`Battery level unreadable: ${describe(error)}`);
  }

  try {
    const batteryState = await Battery.getBatteryStateAsync();
    if (batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL) {
      state.charging = true;
    } else if (batteryState === Battery.BatteryState.UNPLUGGED) {
      state.charging = false;
    } else {
      unavailable.push('Charging state reported as unknown by the platform.');
    }
  } catch (error) {
    unavailable.push(`Charging state unreadable: ${describe(error)}`);
  }

  const totalMemory = Device.totalMemory;
  if (typeof totalMemory === 'number' && totalMemory > 0) {
    state.totalRamGb = Math.round((totalMemory / BYTES_PER_GIB) * 10) / 10;
  } else {
    unavailable.push('Total RAM not reported by the platform.');
  }

  if (Platform.OS !== 'android') {
    unavailable.push('Power-aware inference sizing is Android-first.');
  }

  return { state, unavailable };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
