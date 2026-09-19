import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, Field, Row, Screen, Title } from '@/components/Ui';
import { ModeSelector } from '@/components/ModeSelector';
import { useJarvis } from '@/context/JarvisContext';
import type { ChatMessage, Conversation } from '@/lib/storage/types';
import type { IntelligenceMode } from '@/lib/inference/types';
import {
  addMessage,
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  updateConversationTitle,
} from '@/lib/storage/database';
import { createId } from '@/lib/utils/ids';
import { routeCommand } from '@/lib/understand/commandRouter';
import { formatPerformance } from '@/lib/inference/performance';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

function autoTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= 48 ? clean : `${clean.slice(0, 47)}…`;
}

export default function ChatScreen() {
  const jarvis = useJarvis();
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<IntelligenceMode>(jarvis.settings.defaultMode);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');

  useEffect(() => {
    void (async () => {
      const existing = await listConversations();
      const current = existing[0] ?? (await createConversation());
      setConversation(current);
      setMessages(await listMessages(current.id));
    })();
  }, []);

  async function routeShortcut(text: string): Promise<boolean> {
    const route = routeCommand(text);
    if (route.type === 'chat') return false;

    if (route.type === 'understand') {
      router.push({ pathname: '/understand', params: { mode: route.mode, source: route.text } });
    } else if (route.type === 'project') {
      router.push('/projects');
    } else if (route.type === 'memory') {
      router.push('/memory');
    } else {
      router.push({ pathname: '/settings', params: { section: 'diagnostics' } });
    }
    setInput('');
    return true;
  }

  async function send() {
    if (!conversation || !input.trim() || busy) return;
    if (await routeShortcut(input)) return;

    const text = input.trim();
    const isFirstMessage = messages.length === 0;
    const userMessage: ChatMessage = {
      id: createId('msg'),
      conversationId: conversation.id,
      role: 'user',
      content: text,
      createdAt: Date.now(),
      mode,
    };

    await addMessage(userMessage);
    if (isFirstMessage) {
      const title = autoTitle(text);
      await updateConversationTitle(conversation.id, title);
      setConversation({ ...conversation, title, updatedAt: Date.now() });
    }
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setStreaming('');
    setBusy(true);

    try {
      const history = messages.slice(-12).map(({ role, content }) => ({ role, content }));
      const result = await jarvis.ask(text, mode, (token) => setStreaming((current) => current + token), history);
      const assistantMessage: ChatMessage = {
        id: createId('msg'),
        conversationId: conversation.id,
        role: 'assistant',
        content: result.text,
        createdAt: Date.now(),
        mode,
        metrics: result.metrics,
      };
      await addMessage(assistantMessage);
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      const code = errorMessage(error, 'CHAT_FAILED');
      Alert.alert('Chat failed', humanizeError(code));
    } finally {
      setBusy(false);
      setStreaming('');
    }
  }

  async function newChat() {
    const next = await createConversation();
    setConversation(next);
    setMessages([]);
    setStreaming('');
  }

  async function removeCurrentChat() {
    if (!conversation) return;
    await deleteConversation(conversation.id);
    const remaining = await listConversations();
    const next = remaining[0] ?? (await createConversation());
    setConversation(next);
    setMessages(await listMessages(next.id));
  }

  return (
    <Screen>
      <Title>Chat</Title>
      <AppText muted>{conversation?.title ?? 'Private local conversation history.'}</AppText>
      <ModeSelector value={mode} onChange={setMode} />
      <Row>
        <Button title="Local GGUF" disabled onPress={() => undefined} />
        <Button title="Open Free AI Hub" onPress={() => router.push('/online')} />
      </Row>

      {messages.map((message) => (
        <Card key={message.id} title={message.role === 'user' ? 'You' : 'JARVIS'}>
          <AppText>{message.content}</AppText>
          {message.metrics ? <AppText muted>{formatPerformance(message.metrics)}</AppText> : null}
        </Card>
      ))}
      {streaming ? <Card title="JARVIS · streaming"><AppText>{streaming}</AppText></Card> : null}

      <Card title="Message">
        <Field value={input} onChangeText={setInput} placeholder="Message JARVIS…" multiline />
        <AppText muted>/analyse · /draft · /plan · /project · /memory · /status</AppText>
        <Row>
          <Button title={busy ? 'Thinking…' : 'Send'} disabled={busy || !input.trim()} onPress={() => void send()} />
          {busy ? <Button title="Stop" onPress={() => void jarvis.stopGeneration()} /> : null}
          <Button title="New chat" onPress={() => void newChat()} />
          <Button
            title="Delete chat"
            danger
            disabled={!conversation}
            onPress={() => Alert.alert('Delete this chat?', 'This removes the local conversation and its messages.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => void removeCurrentChat() },
            ])}
          />
        </Row>
      </Card>
    </Screen>
  );
}
