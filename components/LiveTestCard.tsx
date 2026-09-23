import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Linking, Platform, Share, StyleSheet, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { AppText, Button, Card, Row } from '@/components/Ui';
import { colors } from '@/components/theme';
import { useJarvis } from '@/context/JarvisContext';
import type { ChannelFetch } from '@/lib/telemetry/githubChannel';
import { formatEvent, liveLog } from '@/lib/telemetry/liveLog';
import { getLiveStatus, isLiveActive, startLiveLink, stopLiveLink, subscribeLiveStatus } from '@/lib/telemetry/liveSession';
import { clearLiveToken, DEFAULT_LIVE_CHANNEL, readLiveToken, setLiveToken } from '@/lib/telemetry/liveToken';
import { errorMessage } from '@/lib/utils/errors';

const TOKEN_HELP_URL =
  'https://github.com/settings/personal-access-tokens/new?name=JARVIS%20live%20link&description=Posts%20JARVIS%20test%20logs&expires_in=90';

/**
 * Live test link: while it is on, every event JARVIS records is posted to a
 * private GitHub channel in small batches, where Claude can follow the test
 * as it happens. Off unless the owner starts it; ends itself after 30 minutes.
 */
export function LiveTestCard() {
  const jarvis = useJarvis();
  const status = useSyncExternalStore(subscribeLiveStatus, getLiveStatus, getLiveStatus);
  const channel = jarvis.settings.liveChannel ?? DEFAULT_LIVE_CHANNEL;
  const [repoDraft, setRepoDraft] = useState(`${channel.owner}/${channel.repo}`);
  const [numberDraft, setNumberDraft] = useState(channel.number ? String(channel.number) : '');
  const [tokenDraft, setTokenDraft] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => liveLog.snapshot().slice(-6).map(formatEvent));

  useEffect(() => {
    void readLiveToken().then((token) => setHasToken(Boolean(token))).catch(() => setHasToken(false));
  }, []);

  useEffect(
    () =>
      liveLog.subscribe(() => {
        setRecent(liveLog.snapshot().slice(-6).map(formatEvent));
      }),
    [],
  );

  const active = isLiveActive(status);

  async function saveChannel(): Promise<{ owner: string; repo: string; number?: number } | undefined> {
    const match = /^\s*([\w.-]+)\/([\w.-]+)\s*$/.exec(repoDraft);
    if (!match) {
      Alert.alert('Channel', 'Write the repository as owner/name, for example OgSmiley1/jarvis-live-tests.');
      return undefined;
    }
    const parsed = numberDraft.trim() ? Number(numberDraft.trim()) : undefined;
    if (parsed !== undefined && (!Number.isInteger(parsed) || parsed <= 0)) {
      Alert.alert('Channel', 'The issue or PR number must be a whole number, or empty.');
      return undefined;
    }
    const next = { owner: match[1]!, repo: match[2]!, ...(parsed ? { number: parsed } : {}) };
    await jarvis.updateSettings({ liveChannel: next });
    return next;
  }

  async function saveToken() {
    try {
      await setLiveToken(tokenDraft);
      setTokenDraft('');
      setHasToken(true);
    } catch (error) {
      Alert.alert('Token not saved', errorMessage(error));
    }
  }

  async function start() {
    const target = await saveChannel();
    if (!target) return;
    const token = await readLiveToken();
    if (!token) {
      Alert.alert('Token needed', 'Paste a GitHub token first. It stays in the Android keystore.');
      return;
    }
    const header = `${Platform.OS} ${String(Platform.Version)} · JARVIS ${Constants.expoConfig?.version ?? '?'} · model ${
      jarvis.modelState.status
    }${jarvis.modelState.modelName ? ` (${jarvis.modelState.modelName})` : ''}`;
    const result = await startLiveLink({ target, token, header, fetchImpl: fetch as unknown as ChannelFetch });
    if (result.state === 'error' && result.error) Alert.alert('Live link did not start', result.error);
  }

  async function shareLog() {
    const text = liveLog.toText();
    if (!text) {
      Alert.alert('Nothing yet', 'Talk to JARVIS first; the log fills as it works.');
      return;
    }
    await Share.share({ message: text });
  }

  const stateLine =
    status.state === 'idle'
      ? 'Off'
      : status.state === 'connecting'
        ? 'Connecting…'
        : status.state === 'live'
          ? `LIVE · ${status.posted} posted · ${status.pending} waiting`
          : status.state === 'backoff'
            ? `LIVE (paused) · ${status.error ?? ''}`
            : status.state === 'stopped'
              ? `Ended · ${status.posted} posted`
              : `Error · ${status.error ?? ''}`;

  return (
    <Card title="Live test link">
      <AppText muted>
        While on, what JARVIS hears, answers, says and fails at is posted to a private GitHub channel every few seconds, so
        Claude can follow your test live. It includes your words and JARVIS&apos;s replies — use a PRIVATE repository. API
        keys are scrubbed before anything is sent. Ends itself after 30 minutes.
      </AppText>
      <AppText>Status: {stateLine}</AppText>
      {status.dropped ? <AppText muted>{status.dropped} lines dropped while offline.</AppText> : null}
      {status.url ? <Button title="Open channel" onPress={() => void Linking.openURL(status.url!)} /> : null}

      <TextInput
        value={repoDraft}
        onChangeText={setRepoDraft}
        placeholder="owner/private-repo"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!active}
        style={styles.input}
      />
      <TextInput
        value={numberDraft}
        onChangeText={setNumberDraft}
        placeholder="Issue or PR number (empty: new issue per test)"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        editable={!active}
        style={styles.input}
      />
      <TextInput
        value={tokenDraft}
        onChangeText={setTokenDraft}
        placeholder={hasToken ? 'Token saved · paste to replace' : 'Paste a fine-grained GitHub token'}
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Row>
        <Button title="Save token" disabled={!tokenDraft.trim()} onPress={() => void saveToken()} />
        {hasToken ? (
          <Button
            title="Remove token"
            danger
            onPress={() => void clearLiveToken().then(() => setHasToken(false))}
          />
        ) : null}
        <Button title="Make a token" onPress={() => void Linking.openURL(TOKEN_HELP_URL)} />
      </Row>
      <AppText muted>
        Token: Repository access → only the channel repository; Permissions → Issues: Read and write (add Pull requests:
        Read and write if the channel is a PR).
      </AppText>
      <Row>
        {active ? (
          <Button title="Stop live link" danger onPress={() => void stopLiveLink()} />
        ) : (
          <Button title="Start live link" disabled={!hasToken} onPress={() => void start()} />
        )}
        <Button title="Share log" onPress={() => void shareLog()} />
      </Row>

      <View style={styles.log}>
        {recent.length === 0 ? <AppText muted>No events yet.</AppText> : null}
        {recent.map((line, index) => (
          <AppText key={`${index}-${line}`} muted>
            {line}
          </AppText>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    color: colors.text,
    backgroundColor: colors.panel2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 48,
  },
  log: { gap: 2, paddingTop: 8, borderTopWidth: 1, borderColor: colors.border },
});
