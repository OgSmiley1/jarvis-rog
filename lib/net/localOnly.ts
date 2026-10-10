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
/** The authenticated Termux bridge is a fixed loopback service on this device. */
function isLocalTermuxRequest(input: string | Request | URL): boolean {
  try {
    const raw = typeof input === 'string' ? input : 'url' in input ? input.url : String(input);
    const url = new URL(raw);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '8765'
      && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}
/** Cancel active HTTP requests when the owner enables Local Only. */
export function installNetworkGuard(): void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const localTermux = isLocalTermuxRequest(input);
    if (!localTermux) assertNetworkAllowed();
    const controller = new AbortController();
    const signal = init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
    const abort = () => controller.abort();
    const unsubscribe = subscribeNetworkPolicy(() => { if (localOnly && !localTermux) abort(); });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      const response = await original(input, { ...init, signal: controller.signal });
      if (!localTermux) assertNetworkAllowed();
      return response;
    } finally {
      signal?.removeEventListener('abort', abort);
      unsubscribe();
    }
  };
}
