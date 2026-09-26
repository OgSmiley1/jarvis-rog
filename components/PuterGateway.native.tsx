import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors } from '@/components/theme';
import { PUTER_BRIDGE_HTML } from '@/lib/online/puterBridgeHtml';
import { OPENER_RELAY_SCRIPT, interpretPopupMessage, isPuterSignInUrl, setTokenScript } from '@/lib/online/puterPopup';
import type { OnlineChatMessage, PuterBridgeEvent } from '@/lib/online/types';

export interface PuterGatewayHandle {
  /**
   * Rebuild the bridge page from scratch.
   *
   * This remounts the WebView rather than calling `reload()`: `reload()`
   * reloads whatever page is *currently* shown, and when sign-in has taken
   * over the frame that is Puter's sign-in page, not the bridge — so it
   * would have reloaded the very screen that was stuck.
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

/**
 * The keyless online gateway, plus a host for Puter's popup sign-in.
 *
 * Puter signs in through a popup that posts the session back to its opener
 * (see lib/online/puterPopup.ts, read from puter.js's own source). The bridge
 * allows multiple windows so a popup no longer replaces the bridge page;
 * JARVIS opens the sign-in in its own sheet, gives that page an opener that
 * relays to native, and hands the token to the bridge through Puter's public
 * `puter.setAuthToken()`.
 */
export const PuterGateway = forwardRef<PuterGatewayHandle, Props>(function PuterGateway({ onEvent }, ref) {
  const webRef = useRef<WebView>(null);
  const [bridgeKey, setBridgeKey] = useState(0);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);
  const [popupNote, setPopupNote] = useState<string>();

  const send = (command: unknown) => {
    webRef.current?.injectJavaScript(safeScript(command));
  };

  useImperativeHandle(ref, () => ({
    reset: () => {
      setPopupUrl(null);
      setBridgeKey((key) => key + 1);
    },
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

  const onPopupMessage = (event: WebViewMessageEvent) => {
    // The URL is the WebView's own report of the sending page — the page
    // itself cannot forge it. interpretPopupMessage refuses anything that is
    // not from https://puter.com.
    const outcome = interpretPopupMessage(event.nativeEvent.data, event.nativeEvent.url);
    if (outcome.kind === 'token') {
      webRef.current?.injectJavaScript(setTokenScript(outcome.token));
      setPopupUrl(null);
      setPopupNote(undefined);
    } else if (outcome.kind === 'failed') {
      setPopupUrl(null);
      onEvent({ type: 'bridge_error', payload: { message: `Puter sign-in was not completed: ${outcome.reason}` } });
    } else if (outcome.kind === 'closed') {
      setPopupUrl(null);
    }
  };

  return (
    <View style={styles.shell}>
      <WebView
        key={bridgeKey}
        ref={webRef}
        source={{ html: PUTER_BRIDGE_HTML, baseUrl: 'https://jarvis.local/' }}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptCanOpenWindowsAutomatically
        // Allowed now, so a window.open() arrives here as an event instead of
        // navigating the bridge page away — which is what stranded sign-in.
        setSupportMultipleWindows
        onOpenWindow={(event) => {
          const url = event.nativeEvent.targetUrl;
          if (isPuterSignInUrl(url)) {
            setPopupNote(undefined);
            setPopupUrl(url);
          } else if (url && url.startsWith('https://')) {
            // Any other link the bridge opens goes to the system browser, not
            // into JARVIS.
            void Linking.openURL(url);
          }
          // about:blank and empty probes (puter.js's popup-capability check)
          // are ignored.
        }}
        onMessage={onMessage}
        style={styles.webview}
      />

      <Modal visible={popupUrl !== null} animationType="slide" onRequestClose={() => setPopupUrl(null)}>
        <SafeAreaView style={styles.popupScreen}>
          <View style={styles.popupBar}>
            <Text style={styles.popupTitle}>Sign in to Puter</Text>
            <Pressable onPress={() => setPopupUrl(null)} accessibilityRole="button" style={styles.popupClose}>
              <Text style={styles.popupCloseText}>Close</Text>
            </Pressable>
          </View>
          {popupNote ? <Text style={styles.popupNote}>{popupNote}</Text> : null}
          {popupUrl ? (
            <WebView
              source={{ uri: popupUrl }}
              injectedJavaScriptBeforeContentLoaded={OPENER_RELAY_SCRIPT}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              setSupportMultipleWindows={false}
              onMessage={onPopupMessage}
              style={styles.popupWebview}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
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
  popupScreen: { flex: 1, backgroundColor: colors.bg },
  popupBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  popupTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  popupClose: { paddingVertical: 6, paddingHorizontal: 10 },
  popupCloseText: { color: colors.accent, fontWeight: '800' },
  popupNote: { color: colors.muted, paddingHorizontal: 16, paddingTop: 8 },
  popupWebview: { flex: 1, backgroundColor: '#FFFFFF' },
});
