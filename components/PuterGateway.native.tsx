import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { PUTER_BRIDGE_HTML } from '@/lib/online/puterBridgeHtml';
import type { OnlineChatMessage, PuterBridgeEvent } from '@/lib/online/types';

export interface PuterGatewayHandle {
  /**
   * Reload the bridge page from scratch.
   *
   * Puter's `auth.signIn()` is a popup login: it opens a second window and
   * waits for that window to post the session back. With multiple windows
   * unsupported, the sign-in page loads in place of the bridge instead, and
   * when it finishes there is no opener left to report to — so the spinner
   * never ends. Observed on the owner's ROG ("Signing in…", status stuck at
   * signed_out). Every command below is injected into the bridge page, which
   * is gone at that point, so none of them can recover it. Only a native
   * reload can.
   */
  reset: () => void;
  refreshModels: () => void;
  refreshAuth: () => void;
  signOut: () => void;
  getUsage: () => void;
  chat: (request: {
    requestId: string;
    model: string;
    messages: OnlineChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }) => void;
}

interface Props {
  onEvent: (event: PuterBridgeEvent) => void;
}

function safeScript(command: unknown): string {
  const encoded = JSON.stringify(command).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.__jarvisPuter && window.__jarvisPuter(${encoded}); true;`;
}

export const PuterGateway = forwardRef<PuterGatewayHandle, Props>(function PuterGateway({ onEvent }, ref) {
  const webRef = useRef<WebView>(null);

  const send = (command: unknown) => {
    webRef.current?.injectJavaScript(safeScript(command));
  };

  useImperativeHandle(ref, () => ({
    reset: () => webRef.current?.reload(),
    refreshModels: () => send({ type: 'list_models', requestId: `models_${Date.now()}` }),
    refreshAuth: () => send({ type: 'auth_state', requestId: `auth_${Date.now()}` }),
    signOut: () => send({ type: 'sign_out', requestId: `signout_${Date.now()}` }),
    getUsage: () => send({ type: 'usage', requestId: `usage_${Date.now()}` }),
    chat: (request) => send({ type: 'chat', ...request }),
  }));

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as PuterBridgeEvent;
      if (parsed?.type) onEvent(parsed);
    } catch {
      onEvent({ type: 'bridge_error', payload: { message: 'Malformed Puter bridge message.' } });
    }
  };

  return (
    <View style={styles.shell}>
      <WebView
        ref={webRef}
        source={{ html: PUTER_BRIDGE_HTML, baseUrl: 'https://jarvis.local/' }}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptCanOpenWindowsAutomatically
        setSupportMultipleWindows={false}
        onMessage={onMessage}
        style={styles.webview}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    minHeight: 160,
    borderRadius: 14,
    overflow: 'hidden',
  },
  webview: {
    backgroundColor: '#0E141A',
    minHeight: 160,
  },
});
