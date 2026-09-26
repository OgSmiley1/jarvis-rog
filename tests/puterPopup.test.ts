import { describe, expect, it } from 'vitest';
import {
  OPENER_RELAY_SCRIPT,
  PUTER_GUI_ORIGIN,
  interpretPopupMessage,
  isPuterSignInUrl,
  setTokenScript,
} from '@/lib/online/puterPopup';

const SIGN_IN = 'https://puter.com/action/sign-in?embedded_in_popup=true&msg_id=0&request_auth=true';
const envelope = (kind: string, data: unknown) => JSON.stringify({ __jarvisPuterPopup: kind, data });

describe('Puter popup detection', () => {
  it('recognises the sign-in URL puter.js opens', () => {
    expect(isPuterSignInUrl(SIGN_IN)).toBe(true);
  });

  it('refuses look-alike hosts and other pages', () => {
    expect(isPuterSignInUrl('https://puter.com.evil.example/action/sign-in')).toBe(false);
    expect(isPuterSignInUrl('http://puter.com/action/sign-in')).toBe(false);
    expect(isPuterSignInUrl('https://puter.com/app/editor')).toBe(false);
    expect(isPuterSignInUrl('about:blank')).toBe(false);
    expect(isPuterSignInUrl('')).toBe(false);
    expect(isPuterSignInUrl(undefined)).toBe(false);
  });
});

describe('Puter popup message relay', () => {
  it('accepts a successful token message from puter.com', () => {
    const outcome = interpretPopupMessage(
      envelope('message', { msg: 'puter.token', msg_id: 0, success: true, token: 'tok_123', username: 'articulate_table_59408' }),
      'https://puter.com/action/sign-in?embedded_in_popup=true&msg_id=0',
    );
    expect(outcome).toEqual({ kind: 'token', token: 'tok_123' });
  });

  it('ignores a token that did not come from a puter.com page', () => {
    // The page URL is what the WebView reports, which the page cannot forge.
    const outcome = interpretPopupMessage(
      envelope('message', { msg: 'puter.token', success: true, token: 'stolen' }),
      'https://evil.example/fake-sign-in',
    );
    expect(outcome).toEqual({ kind: 'ignore' });
  });

  it('reports a failed sign-in rather than pretending it worked', () => {
    const outcome = interpretPopupMessage(envelope('message', { msg: 'puter.token', success: false, error: 'denied' }), SIGN_IN);
    expect(outcome).toEqual({ kind: 'failed', reason: 'denied' });
  });

  it('treats an empty token as a failure', () => {
    const outcome = interpretPopupMessage(envelope('message', { msg: 'puter.token', success: true, token: '  ' }), SIGN_IN);
    expect(outcome.kind).toBe('failed');
  });

  it('passes through the popup closing itself', () => {
    expect(interpretPopupMessage(envelope('close', null), SIGN_IN)).toEqual({ kind: 'closed' });
  });

  it('ignores unrelated or malformed messages', () => {
    expect(interpretPopupMessage('not json', SIGN_IN).kind).toBe('ignore');
    expect(interpretPopupMessage(envelope('message', { msg: 'something.else' }), SIGN_IN).kind).toBe('ignore');
    expect(interpretPopupMessage(JSON.stringify({ unrelated: true }), SIGN_IN).kind).toBe('ignore');
  });
});

describe('Puter popup scripts', () => {
  it('only installs the opener relay on puter.com', () => {
    expect(OPENER_RELAY_SCRIPT).toContain(`location.origin !== '${PUTER_GUI_ORIGIN}'`);
    expect(OPENER_RELAY_SCRIPT).toContain('postMessage');
  });

  it('embeds the token as a string literal so it cannot break out of the script', () => {
    const script = setTokenScript('abc"); alert(1); ("</script>');
    expect(script).toContain('window.__jarvisPuterSetToken(');
    expect(script).not.toContain('</script>');
    // The hostile quote stays inside the JSON string.
    expect(script).toContain('\\"); alert(1); (\\"');
  });
});
