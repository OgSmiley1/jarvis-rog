/** Test-environment stand-in for `expo`: no native modules are linked under Node. */
export function requireOptionalNativeModule<T>(_name: string): T | null {
  return null;
}
