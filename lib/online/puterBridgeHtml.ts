export const PUTER_BRIDGE_HTML = String.raw`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <meta name="color-scheme" content="dark" />
  <script src="https://js.puter.com/v2/"></script>
  <style>
    html,body { margin:0; padding:0; background:#0E141A; color:#F4F8FA; font-family:system-ui,-apple-system,sans-serif; }
    #wrap { padding:12px; border:1px solid #20313D; border-radius:14px; }
    #status { color:#93A6B0; font-size:13px; margin-bottom:10px; }
    button { appearance:none; border:0; border-radius:10px; background:#66E3FF; color:#001018; font-weight:800; padding:10px 14px; width:100%; }
    button.secondary { background:#20313D; color:#F4F8FA; margin-top:8px; }
    #error { color:#FF7B7B; font-size:12px; margin-top:8px; white-space:pre-wrap; }
  </style>
</head>
<body>
  <div id="wrap">
    <div id="status">Loading Puter.js gateway…</div>
    <button id="connect">Connect Puter for keyless AI</button>
    <div id="error"></div>
  </div>
<script>
(() => {
  const status = document.getElementById('status');
  const errorBox = document.getElementById('error');
  const connect = document.getElementById('connect');

  const post = (type, payload, requestId) => {
    try {
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type, payload, requestId }));
    } catch (_) {}
  };

  const errorText = (error) => {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    return error.msg || error.message || error.error || JSON.stringify(error);
  };

  async function authState() {
    try {
      const signedIn = Boolean(window.puter?.auth?.isSignedIn?.());
      let user = null;
      if (signedIn) {
        try { user = await puter.auth.getUser(); } catch (_) {}
      }
      status.textContent = signedIn
        ? ('Connected' + (user?.username ? ' as ' + user.username : ''))
        : 'Not connected. Tap Connect to authorize keyless AI.';
      connect.textContent = signedIn ? 'Connected · switch/reconnect account' : 'Connect Puter for keyless AI';
      post('auth_state', { signedIn, user });
      return signedIn;
    } catch (error) {
      post('bridge_error', { message: errorText(error) });
      return false;
    }
  }

  async function listModels(requestId) {
    try {
      errorBox.textContent = '';
      const signedIn = await authState();
      if (!signedIn) throw new Error('Connect Puter first.');
      const models = await puter.ai.listModels();
      post('models', models, requestId);
    } catch (error) {
      errorBox.textContent = errorText(error);
      post('bridge_error', { message: errorText(error) }, requestId);
    }
  }

  connect.addEventListener('click', async () => {
    try {
      errorBox.textContent = '';
      await puter.auth.signIn({ request_auth: true });
      await authState();
      await listModels('connect');
    } catch (error) {
      // In JARVIS the sign-in page opens in a separate native window, so the
      // popup puter.js tracks here closes as soon as it opens and puter.js
      // reports 'auth_window_closed'. That is expected, not a failure: the
      // token arrives through __jarvisPuterSetToken below once the owner
      // finishes signing in.
      if (error && error.error === 'auth_window_closed') {
        status.textContent = 'Finish signing in on the Puter screen…';
        return;
      }
      errorBox.textContent = errorText(error);
      post('bridge_error', { message: errorText(error) });
    }
  });

  // Called by JARVIS with the token Puter's sign-in page posted to its opener.
  // puter.setAuthToken is Puter's own public API for exactly this; it
  // persists the session the same way a browser popup sign-in would.
  window.__jarvisPuterSetToken = async (token) => {
    try {
      errorBox.textContent = '';
      puter.setAuthToken(token);
      const signedIn = await authState();
      if (signedIn) await listModels('signed-in');
    } catch (error) {
      errorBox.textContent = errorText(error);
      post('bridge_error', { message: errorText(error) });
    }
  };


  window.__jarvisPuter = async (command) => {
    const requestId = command?.requestId;
    try {
      if (!command || typeof command !== 'object') throw new Error('Invalid bridge command');

      if (command.type === 'list_models') {
        return await listModels(requestId);
      }

      if (command.type === 'auth_state') {
        return await authState();
      }

      if (command.type === 'sign_out') {
        await puter.auth.signOut();
        await authState();
        post('signed_out', {}, requestId);
        return;
      }

      if (command.type === 'usage') {
        if (!puter.auth.isSignedIn()) throw new Error('Connect Puter first.');
        const usage = await puter.auth.getMonthlyUsage();
        post('usage', usage, requestId);
        return;
      }

      if (command.type === 'chat') {
        if (!puter.auth.isSignedIn()) throw new Error('Connect Puter first.');
        const messages = Array.isArray(command.messages) ? command.messages : [];
        const model = String(command.model || '').trim();
        if (!model) throw new Error('Select an online model first.');
        if (!messages.length) throw new Error('Message history is empty.');

        const response = await puter.ai.chat(messages, {
          model,
          stream: true,
          temperature: command.temperature,
          max_tokens: command.maxTokens,
        });

        let fullText = '';
        for await (const part of response) {
          if (part?.type === 'error') {
            throw new Error(part.message || 'Provider stream error');
          }
          const text = typeof part?.text === 'string' ? part.text : '';
          if (text) {
            fullText += text;
            post('chat_chunk', { text }, requestId);
          }
        }
        post('chat_done', { text: fullText }, requestId);
        return;
      }

      throw new Error('Unknown bridge command: ' + command.type);
    } catch (error) {
      post('chat_error', { message: errorText(error) }, requestId);
    }
  };

  const boot = async () => {
    let attempts = 0;
    while (!window.puter && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts += 1;
    }
    if (!window.puter) {
      status.textContent = 'Puter.js failed to load.';
      post('bridge_error', { message: 'Puter.js failed to load. Check internet access.' });
      return;    }
    post('bridge_ready', { version: 1 });
    await authState();
    if (puter.auth.isSignedIn()) await listModels('boot');
  };

  boot();
})();
</script>
</body>
</html>`;
