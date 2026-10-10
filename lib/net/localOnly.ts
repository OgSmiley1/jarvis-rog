/** Application-wide network policy, independent of screens and prompt text. */
let localOnly = false;
const listeners = new Set<() => void>();
export function isLocalOnly(): boolean { return localOnly; }
export function setLocalOnly(value: boolean): void {
  if (value === localOnly) return;
  localOnly = value;
  for (const listener of listeners) { try { listener(); } catch { /* One subsystem must not prevent other requests being stopped. */ } }
}
export function subscribeNetworkPolicy(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function assertNetworkAllowed(): void {
  if (localOnly) throw new Error('LOCAL_ONLY_BLOCKED');
}
/** Fixed loopback services that stay on this device under Local Only. */
function isLocalDeviceRequest(input: string | Request | URL): boolean {
  try {
    const raw = typeof input === 'string' ? input : 'url' in input ? input.url : String(input);
    const url = new URL(raw);
    const loopback = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1')
      && (url.port === '8765' || url.port === '11434') && !url.search && !url.hash && !url.username && !url.password;
    if (!loopback) return false;
    if (url.port === '8765') return url.pathname === '/';
    return url.pathname === '/v1/chat/completions' || url.pathname === '/api/tags' || url.pathname === '/api/generate';
  } catch { return false; }
}
/** Cancel active HTTP requests when the owner enables Local Only. */
export function installNetworkGuard(): void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const localDevice = isLocalDeviceRequest(input);
    if (!localDevice) assertNetworkAllowed();
    const controller = new AbortController();
    const signal = init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
    const abort = () => controller.abort();
    const unsubscribe = subscribeNetworkPolicy(() => { if (localOnly && !localDevice) abort(); });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      const response = await original(input, { ...init, signal: controller.signal });
      if (!localDevice) assertNetworkAllowed();
      return response;
    } finally {
      signal?.removeEventListener('abort', abort);
      unsubscribe();
    }
  };
}
