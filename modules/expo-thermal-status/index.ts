import { requireOptionalNativeModule } from 'expo-modules-core';

interface ExpoThermalStatusNativeModule {
  isSupported(): boolean;
  getCurrentThermalStatus(): number | null;
}

// `requireOptionalNativeModule` returns null instead of throwing when the
// module isn't linked (any non-Android platform, or an Android build that
// predates this module). Every export below must degrade to "unsupported"
// in that case rather than guessing a status.
const nativeModule = requireOptionalNativeModule<ExpoThermalStatusNativeModule>('ExpoThermalStatus');

/**
 * True only on Android 10+ (API 29), where PowerManager exposes a thermal
 * verdict. Callers must check this before trusting getCurrentThermalStatus's
 * absence to mean "cool" rather than "not measurable here".
 */
export function isThermalStatusSupported(): boolean {
  return nativeModule?.isSupported() ?? false;
}

/**
 * Mirrors android.os.PowerManager.getCurrentThermalStatus(): 0 (NONE) through
 * 6 (SHUTDOWN). Returns undefined when the platform cannot report it — never
 * a substituted or estimated value.
 */
export function getCurrentThermalStatus(): number | undefined {
  const value = nativeModule?.getCurrentThermalStatus();
  return typeof value === 'number' ? value : undefined;
}
