import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'jarvis.termux.secret';
const ENDPOINT = 'http://127.0.0.1:8765';

export async function setTermuxSecret(secret: string): Promise<void> {
  if (!secret.trim()) throw new Error('TERMUX_SECRET_EMPTY');
  await SecureStore.setItemAsync(TOKEN_KEY, secret.trim());
}

export async function clearTermuxSecret(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function callTermux(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const secret = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!secret) throw new Error('TERMUX_NOT_CONFIGURED');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Jarvis-Auth': secret,
    },
    body: JSON.stringify({ action, params }),
  });

  const body = (await response.json()) as { ok?: boolean; result?: unknown; error?: string };
  if (!response.ok || !body.ok) throw new Error(body.error ?? `TERMUX_HTTP_${response.status}`);
  return body.result;
}
