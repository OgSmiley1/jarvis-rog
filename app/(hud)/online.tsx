import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { AppText, Button, Card, Field, Row, Screen, Title } from '@/components/Ui';
import { PuterGateway, type PuterGatewayHandle } from '@/components/PuterGateway';
import { useJarvis } from '@/context/JarvisContext';
import { FREE_AI_PORTALS } from '@/lib/online/freePortals';
import {
  filterOnlineModels,
  listProviders,
  normalizeOnlineModels,
  pickAutoFreeModel,
  pickDefaultFreeModel,
} from '@/lib/online/modelCatalog';
import type { OnlineChatMessage, OnlineModel, PuterBridgeEvent } from '@/lib/online/types';
import type { OnlineChatRecord } from '@/lib/storage/types';
import { addOnlineMessage, clearOnlineMessages, listOnlineMessages } from '@/lib/storage/database';
import { createId } from '@/lib/utils/ids';

function eventMessage(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    return String((payload as { message?: unknown }).message ?? 'Unknown online gateway error');
  }
  return 'Unknown online gateway error';
}

export default function OnlineScreen() {
  const jarvis = useJarvis();
  const gateway = useRef<PuterGatewayHandle>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'signed_out' | 'signed_in' | 'error'>('loading');
  const [username, setUsername] = useState<string>();
  const [models, setModels] = useState<OnlineModel[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [selectedModelId, setSelectedModelId] = useState(jarvis.settings.onlineModelId ?? '');
  const [freeOnly, setFreeOnly] = useState(jarvis.settings.onlineFreeOnly ?? true);
  const [autoFree, setAutoFree] = useState(true);
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<OnlineChatRecord[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string>();
  const [routeReason, setRouteReason] = useState<string>();
  const [usage, setUsage] = useState<string>();
  const requestRef = useRef<string | undefined>(undefined);
  const activeModelRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    void listOnlineMessages().then(setMessages).catch((error) => setLastError(String(error)));
  }, []);

  useEffect(() => {
    void jarvis.updateSettings({ onlineFreeOnly: freeOnly }).catch(() => undefined);
  }, [freeOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const providers = useMemo(() => listProviders(models), [models]);
  const visibleModels = useMemo(
    () => filterOnlineModels(models, { freeOnly, provider: selectedProvider, query }).slice(0, 40),
    [freeOnly, models, query, selectedProvider],
  );
  const selectedModel = models.find((model) => model.id === selectedModelId);

  async function selectModel(model: OnlineModel) {
    setSelectedModelId(model.id);
    await jarvis.updateSettings({ onlineModelId: model.id });
  }

  function onBridgeEvent(event: PuterBridgeEvent) {
    if (event.type === 'bridge_ready') {
      setStatus('ready');
      setLastError(undefined);
      return;
    }

    if (event.type === 'auth_state') {
      const payload = (event.payload ?? {}) as { signedIn?: boolean; user?: { username?: string } };
      setStatus(payload.signedIn ? 'signed_in' : 'signed_out');
      setUsername(payload.user?.username);
      return;
    }

    if (event.type === 'usage') {
      try { setUsage(JSON.stringify(event.payload, null, 2)); } catch { setUsage(String(event.payload)); }
      return;
    }

    if (event.type === 'models') {
      const next = normalizeOnlineModels(event.payload);
      setModels(next);
      setLastError(undefined);
      if (!next.find((model) => model.id === selectedModelId)) {
        const fallback = pickDefaultFreeModel(next) ?? next[0];
        if (fallback) void selectModel(fallback);
      }
      return;
    }

    if (event.type === 'chat_chunk' && event.requestId === requestRef.current) {
      const payload = (event.payload ?? {}) as { text?: string };
      if (payload.text) setStreaming((current) => current + payload.text);
      return;
    }

    if (event.type === 'chat_done' && event.requestId === requestRef.current) {
      const payload = (event.payload ?? {}) as { text?: string };
      const answer = String(payload.text ?? '').trim();
      setBusy(false);
      setStreaming('');
      const completedModelId = activeModelRef.current ?? selectedModelId;
      requestRef.current = undefined;
      activeModelRef.current = undefined;
      if (!answer) {
        setLastError('The selected online model returned an empty response.');
        return;
      }
      const record: OnlineChatRecord = {
        id: createId('online'),
        role: 'assistant',
        content: answer,
        modelId: completedModelId,
        createdAt: Date.now(),
      };
      void addOnlineMessage(record).then(() => setMessages((current) => [...current, record])).catch((error) => setLastError(String(error)));
      return;
    }

    if ((event.type === 'chat_error' || event.type === 'bridge_error') && (!event.requestId || event.requestId === requestRef.current)) {
      const message = eventMessage(event.payload);
      setLastError(message);
      setBusy(false);
      setStreaming('');
      requestRef.current = undefined;
      activeModelRef.current = undefined;
      if (event.type === 'bridge_error') setStatus('error');
    }
  }

  async function send() {
    const clean = input.trim();
    if (!clean || busy) return;
    if (status !== 'signed_in') {
      Alert.alert('Connect first', 'Tap the Connect Puter button inside the gateway card. No API key is required.');
      return;
    }
    let effectiveModelId = selectedModelId;
    let effectiveModel = selectedModel;
    if (autoFree) {
      const routed = pickAutoFreeModel(clean, models);
      setRouteReason(routed.reason);
      if (!routed.model) {
        Alert.alert('No free model available', routed.reason);
        return;
      }
      effectiveModelId = routed.model.id;
      effectiveModel = routed.model;
      setSelectedModelId(routed.model.id);      await jarvis.updateSettings({ onlineModelId: routed.model.id });
    }
    if (!effectiveModelId) {
      Alert.alert('Select a model', 'Refresh the live model catalog and select a free model.');
      return;
    }
    if (freeOnly && !effectiveModel?.freeVariant) {
      Alert.alert('Free-only mode', 'The selected model is not marked :free by the live catalog. Select a free variant or turn off Free-only mode.');
      return;
    }

    const userRecord: OnlineChatRecord = {
      id: createId('online'),
      role: 'user',
      content: clean,
      modelId: effectiveModelId,
      createdAt: Date.now(),
    };
    await addOnlineMessage(userRecord);
    const nextMessages = [...messages, userRecord];
    setMessages(nextMessages);
    setInput('');
    setStreaming('');
    setLastError(undefined);
    setBusy(true);

    const requestId = createId('online_req');
    requestRef.current = requestId;
    activeModelRef.current = effectiveModelId;
    const conversation: OnlineChatMessage[] = nextMessages.slice(-16).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    gateway.current?.chat({
      requestId,
      model: effectiveModelId,
      messages: conversation,
      temperature: 0.5,
      maxTokens: 1200,
    });
  }

  async function clearChat() {
    await clearOnlineMessages();
    setMessages([]);
    setStreaming('');
  }

  return (
    <Screen>
      <Title>Free AI Hub</Title>
      <AppText muted>
        One JARVIS screen for keyless online AI. Local GGUF remains your offline brain; this tab adds internet models without storing a developer API key.
      </AppText>

      <Card title="Keyless gateway">
        <AppText>
          Status: {status}{username ? ` · ${username}` : ''}
        </AppText>
        <PuterGateway ref={gateway} onEvent={onBridgeEvent} />
        <Row>
          <Button title="Refresh models" onPress={() => gateway.current?.refreshModels()} />
          <Button title="Usage" onPress={() => gateway.current?.getUsage()} />
          <Button title="Sign out" onPress={() => gateway.current?.signOut()} />
          <Button title="Reset connection" onPress={() => gateway.current?.reset()} />
        </Row>
        <AppText muted>
          Puter handles browser authentication. JARVIS does not ask you to paste an OpenAI, Google, xAI or Anthropic API key.
        </AppText>
        <AppText muted>
          Connect opens Puter&apos;s sign-in on its own screen; finishing there signs this hub in. If anything gets stuck, tap
          Reset connection. The online hub is optional — your local brain answers without it, offline.
        </AppText>
        {usage ? <AppText muted>{`Usage snapshot: ${usage.slice(0, 900)}`}</AppText> : null}
      </Card>

      <Card title="Official free web fallbacks">
        <AppText muted>
          These open the providers&apos; official consumer sites. They are separate sessions, so replies are not automatically copied back into JARVIS.
        </AppText>
        {FREE_AI_PORTALS.map((portal) => (
          <Card key={portal.id} title={portal.name}>
            <AppText muted>{portal.description}</AppText>
            <Button title={`Open ${portal.name}`} onPress={() => void Linking.openURL(portal.url)} />
          </Card>
        ))}
      </Card>

      <Card title="Model guard">
        <Row>
          <Button title={freeOnly ? 'Free-only: ON' : 'Free-only: OFF'} onPress={() => setFreeOnly((current) => !current)} />
          <Button title={autoFree ? 'Auto-Free: ON' : 'Auto-Free: OFF'} onPress={() => setAutoFree((current) => !current)} />
          <Button title="All providers" onPress={() => setSelectedProvider(undefined)} />
        </Row>
        <AppText muted>
          Free-only shows only live model IDs explicitly marked :free. Auto-Free chooses only from that explicit free pool. Provider quotas can still change.
        </AppText>
        {routeReason ? <AppText muted>{routeReason}</AppText> : null}
      </Card>

      {providers.length ? (
        <Card title="Providers">
          <Row>
            {providers.slice(0, 12).map((provider) => (
              <Button
                key={provider.id}
                title={`${provider.label} · ${provider.freeCount} free`}
                onPress={() => setSelectedProvider(provider.id)}
              />
            ))}
          </Row>
        </Card>
      ) : null}

      <Card title="Find a model">
        <Field value={query} onChangeText={setQuery} placeholder="GPT, Gemini, Grok, Claude, DeepSeek, Qwen…" />
        <AppText muted>
          {models.length ? `${models.length} live models · ${models.filter((model) => model.freeVariant).length} explicitly free variants` : 'Connect and refresh to load the live model catalog.'}
        </AppText>
      </Card>

      {visibleModels.length ? (
        <Card title="Models">
          {visibleModels.map((model) => (
            <Card key={model.id} title={`${model.freeVariant ? 'FREE · ' : ''}${model.providerLabel}`}>
              <AppText>{model.name}</AppText>
              <AppText muted>{model.id}</AppText>
              <Button
                title={selectedModelId === model.id ? 'Selected' : 'Use model'}
                disabled={selectedModelId === model.id}
                onPress={() => void selectModel(model)}
              />
            </Card>
          ))}
        </Card>
      ) : null}

      <Card title="Online conversation">
        <AppText muted>
          Model: {selectedModel ? `${selectedModel.providerLabel} · ${selectedModel.name}` : selectedModelId || 'none selected'}
        </AppText>
        {messages.map((message) => (
          <Card key={message.id} title={message.role === 'user' ? 'You' : `JARVIS · ${message.modelId ?? 'online'}`}>
            <AppText>{message.content}</AppText>
          </Card>
        ))}
        {streaming ? <Card title="JARVIS · streaming"><AppText>{streaming}</AppText></Card> : null}
        {lastError ? <AppText>{`Error: ${lastError}`}</AppText> : null}
        <Field value={input} onChangeText={setInput} placeholder="Ask the selected online model…" multiline />
        <Row>
          <Button title={busy ? 'Thinking…' : 'Send'} disabled={busy || !input.trim()} onPress={() => void send()} />
          <Button title="Clear" danger onPress={() => void clearChat()} />
        </Row>
      </Card>
    </Screen>
  );
}
