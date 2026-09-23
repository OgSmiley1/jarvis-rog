/**
 * Hosting Puter's popup sign-in inside a React Native WebView.
 *
 * Read from @heyputer/puter.js 2.6.3 (src/modules/Auth.js), not guessed:
 *
 * - `puter.auth.signIn()` opens
 *   `https://puter.com/action/sign-in?embedded_in_popup=true&msg_id=N`
 *   with `window.open`.
 * - When the owner signs in, that page posts
 *   `{ msg: 'puter.token', msg_id, success, token, ... }` to `window.opener`.
 * - The waiting page accepts it only if `e.source` is the popup it opened, so
 *   a message cannot be faked from anywhere else, and then calls
 *   `puter.setAuthToken(token)`.
 *
 * What went wrong on the owner's ROG: with multiple windows unsupported, the
 * sign-in page loaded *inside* the bridge WebView, where `window.opener` is
 * null. It had nowhere to post the token, so "Signing in…" spun forever.
 *
 * The fix: open the popup in a second WebView JARVIS controls, give that page
 * a `window.opener` that relays to native, and hand the token to the bridge
 * through Puter's own public `puter.setAuthToken()`. The trust decision Puter
 * makes with `e.source` is made here instead: a token is accepted only from a
 * page whose origin is exactly https://puter.com, inside the popup WebView
 * that JARVIS itself opened.
 */

export const PUTER_GUI_ORIGIN = 'https://puter.com';

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** A window.open() the bridge made that should become the sign-in popup. */
export function isPuterSignInUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (originOf(url) !== PUTER_GUI_ORIGIN) return false;
  try {
    return new URL(url).pathname.startsWith('/action/sign-in');
  } catch {
    return false;
  }
}

/**
 * Injected into the popup before any of Puter's scripts run. Only on
 * puter.com: anywhere else the page keeps whatever opener it had (none).
 */
export const OPENER_RELAY_SCRIPT = `(function () {
  if (location.origin !== '${PUTER_GUI_ORIGIN}') return;
  function relay(kind, data) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ __jarvisPuterPopup: kind, data: data }));
    } catch (e) {}
  }
  var opener = {
    closed: false,
    postMessage: function (data) { relay('message', data); },
    focus: function () {}
  };
  try {
    Object.defineProperty(window, 'opener', { configurable: true, get: function () { return opener; } });
  } catch (e) {
    window.opener = opener;
  }
  window.close = function () { relay('close', null); };
})(); true;`;

export type PopupOutcome =
  | { kind: 'token'; token: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'closed' }
  | { kind: 'ignore' };

/**
 * Decide what a message from the popup WebView means.
 *
 * `pageUrl` is the URL the WebView reports for the page that sent it — the
 * native side's view, which the page cannot forge.
 */
export function interpretPopupMessage(raw: string, pageUrl: string | undefined): PopupOutcome {
  if (originOf(pageUrl ?? '') !== PUTER_GUI_ORIGIN) return { kind: 'ignore' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'ignore' };
  }

  const envelope = parsed as { __jarvisPuterPopup?: unknown; data?: unknown };
  if (envelope.__jarvisPuterPopup === 'close') return { kind: 'closed' };
  if (envelope.__jarvisPuterPopup !== 'message') return { kind: 'ignore' };

  const data = envelope.data as { msg?: unknown; success?: unknown; token?: unknown; error?: unknown } | null;
  if (!data || data.msg !== 'puter.token') return { kind: 'ignore' };

  if (data.success === true && typeof data.token === 'string' && data.token.trim()) {
    return { kind: 'token', token: data.token.trim() };
  }
  return { kind: 'failed', reason: typeof data.error === 'string' ? data.error : 'sign-in was not completed' };
}

/**
 * The script that hands a token to the bridge page. The token is embedded as
 * a JSON string literal, never concatenated raw, so it cannot break out of
 * the script.
 */
export function setTokenScript(token: string): string {
  const literal = JSON.stringify(token).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.__jarvisPuterSetToken && window.__jarvisPuterSetToken(${literal}); true;`;
}
