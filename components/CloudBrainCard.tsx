import { useState } from 'react';
import { Alert, Linking, Switch, TextInput, View, StyleSheet } from 'react-native';
import { AppText, Button, Card, Row } from '@/components/Ui';
import { colors } from '@/components/theme';
import { useJarvis } from '@/context/JarvisContext';
import { buildMessages } from '@/lib/inference/promptBuilder';
import { CLOUD_PROVIDERS, askCloud, type CloudProviderId, type FetchLike } from '@/lib/online/cloudBrain';
import { readCloudKeys } from '@/lib/online/cloudKeys';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

/**
 * Settings for the cloud brain. Keys go straight to the Android keystore; the
 * card only ever learns whether one is present, and never displays it back.
 */
export function CloudBrainCard() {
  const jarvis = useJarvis();
  const [drafts, setDrafts] = useState<Partial<Record<CloudProviderId, string>>>({});
  const [modelDrafts, setModelDrafts] = useState<Partial<Record<CloudProviderId, string>>>({});
  const [testResult, setTestResult] = useState<string>();
  const [testing, setTesting] = useState(false);

  async function save(id: CloudProviderId) {
    try {
      await jarvis.saveCloudKey(id, drafts[id] ?? '');
      setDrafts((current) => ({ ...current, [id]: '' }));
    } catch (error) {
      Alert.alert('Key not saved', humanizeError(errorMessage(error)));
    }
  }

  async function saveModel(id: CloudProviderId) {
    const value = modelDrafts[id]?.trim();
    const next = { ...(jarvis.settings.cloudModels ?? {}) };
    if (value) next[id] = value;
    else delete next[id];
    await jarvis.updateSettings({ cloudModels: next });
    setModelDrafts((current) => ({ ...current, [id]: '' }));
  }

  /** A real round trip through the same failover the HUD uses. */
  async function test() {
    setTesting(true);
    setTestResult(undefined);
    try {
      const answer = await askCloud({
        messages: buildMessages({
          mode: 'fast',
          language: jarvis.settings.language,
          userMessage: 'Reply with exactly: JARVIS cloud brain online.',
          spoken: true,
        }),
        mode: 'fast',
        keys: await readCloudKeys(),
        models: jarvis.settings.cloudModels,
        fetchImpl: fetch as unknown as FetchLike,
      });
      const tried = answer.attempts.map((attempt) => `${attempt.provider} ${attempt.ok ? 'OK' : attempt.error} (${attempt.ms} ms)`);
      setTestResult(`Answered by ${answer.provider} · ${answer.model}\n“${answer.text}”\n${tried.join('\n')}`);
    } catch (error) {
      setTestResult(humanizeError(errorMessage(error)));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card title="Cloud brain (fallback)">
      <View style={styles.switchRow}>
        <AppText>Answer through the cloud when no local brain is loaded</AppText>
        <Switch
          value={jarvis.settings.cloudFallbackEnabled}
          onValueChange={(value) => void jarvis.updateSettings({ cloudFallbackEnabled: value })}
        />
      </View>
      <AppText muted>
        Off by default. When on, and only while no local brain is loaded, your question and the recent conversation are
        sent to the first provider below that answers. A loaded local brain always answers first and never sends anything.
        Keys are stored in the Android keystore and never shown again.
      </AppText>
      <AppText muted>
        Status: {jarvis.cloudReady
          ? `ready · ${jarvis.cloudProviders.length} provider${jarvis.cloudProviders.length === 1 ? '' : 's'}`
          : jarvis.settings.cloudFallbackEnabled
            ? 'on, but no key saved yet'
            : 'off'}
      </AppText>

      {CLOUD_PROVIDERS.map((provider, index) => {
        const hasKey = jarvis.cloudProviders.includes(provider.id);
        const model = jarvis.settings.cloudModels?.[provider.id] ?? provider.defaultModel;
        return (
          <View key={provider.id} style={styles.provider}>
            <AppText>
              {index + 1}. {provider.name} — {hasKey ? 'key saved' : 'no key'}
            </AppText>
            <AppText muted>Model: {model}</AppText>
            <TextInput
              value={drafts[provider.id] ?? ''}
              onChangeText={(value) => setDrafts((current) => ({ ...current, [provider.id]: value }))}
              placeholder={hasKey ? 'Paste a new key to replace it' : `Paste your free ${provider.name} key`}
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Row>
              <Button title="Save key" disabled={!drafts[provider.id]?.trim()} onPress={() => void save(provider.id)} />
              {hasKey ? <Button title="Remove" danger onPress={() => void jarvis.removeCloudKey(provider.id)} /> : null}
              <Button title="Get free key" onPress={() => void Linking.openURL(provider.keyUrl)} />
            </Row>
            <TextInput
              value={modelDrafts[provider.id] ?? ''}
              onChangeText={(value) => setModelDrafts((current) => ({ ...current, [provider.id]: value }))}
              placeholder={`Model override (default ${provider.defaultModel})`}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Button title="Save model" onPress={() => void saveModel(provider.id)} />
          </View>
        );
      })}

      <Button
        title={testing ? 'Testing…' : 'Test cloud brain'}
        disabled={testing || jarvis.cloudProviders.length === 0}
        onPress={() => void test()}
      />
      {testResult ? <AppText muted>{testResult}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  provider: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border },
  input: {
    color: colors.text,
    backgroundColor: colors.panel2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 48,
  },
});
