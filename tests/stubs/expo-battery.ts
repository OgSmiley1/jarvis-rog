/** Test-environment stand-in for `expo-battery`. */
export enum BatteryState {
  UNKNOWN = 0,
  UNPLUGGED = 1,
  CHARGING = 2,
  FULL = 3,
}
export async function getBatteryLevelAsync(): Promise<number> {
  return -1;
}
export async function getBatteryStateAsync(): Promise<BatteryState> {
  return BatteryState.UNKNOWN;
}
