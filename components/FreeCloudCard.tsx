import { useEffect, useState } from 'react';
import { Alert, Linking, Switch, View } from 'react-native';
import { AppText, Button, Card, Field, Row } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import { CLOUD_PROVIDERS, type CloudProviderId } from '@/lib/online/cloudBrain';
import { clearCloudKey, cloudProvidersWithKeys, setCloudKey } from '@/lib/online/cloudKeys';
import { errorMessage } from '@/lib/utils/errors';

/**
 * The optional free cloud brain. Off by default. Every provider here has a
 * free tier that asks for no card; keys go to the Android keystore and are
 * never shown back. Gemini's free tier may train on prompts, so it is used
 * only with its own switch on.
 */
export function FreeCloudCard() {
  const jarvis = useJarvis();
  const [stored, setStored] = useState<CloudProviderId[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<CloudProviderId, string>>>({});

  const refresh = () => void cloudProvidersWithKeys().then(setStored).catch(() => setStored([]));
  useEffect(refresh, []);

  async function save(id: CloudProviderId) {
    try {
      await setCloudKey(id, drafts[id] ?? '');
      setDrafts((current) => ({ ...current, [id]: '' }));
      refresh();
    } catch (error) {
      Alert.alert('Key not saved', errorMessage(error));
    }
  }

  return (
    <Card title="Free cloud brain (optional)">
      <AppText muted>
        Off: every answer is made on this phone. On: your question text (never your voice) goes to the first free provider
        with a key — Groq, then Cerebras — and if it fails or hits its free limit, the phone answers instead. No card, no
        billing.
      </AppText>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText>Use the free cloud when online</AppText>
        <Switch
          value={Boolean(jarvis.settings.cloudBrainEnabled)}
          onValueChange={(value) => void jarvis.updateSettings({ cloudBrainEnabled: value })}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText>Also use Gemini (its free tier may train on prompts)</AppText>
        <Switch
          value={Boolean(jarvis.settings.cloudAllowTraining)}
          onValueChange={(value) => void jarvis.updateSettings({ cloudAllowTraining: value })}
        />
      </View>
      {CLOUD_PROVIDERS.map((provider) => (
        <View key={provider.id} style={{ gap: 6 }}>
          <AppText>
            {provider.name}: {stored.includes(provider.id) ? 'key saved' : 'no key'}
          </AppText>
          <Field
            value={drafts[provider.id] ?? ''}
            onChangeText={(value) => setDrafts((current) => ({ ...current, [provider.id]: value }))}
            placeholder={`Paste your free ${provider.name} key`}
          />
          <Row>
            <Button title="Save" disabled={!drafts[provider.id]?.trim()} onPress={() => void save(provider.id)} />
            <Button title="Get a free key" onPress={() => void Linking.openURL(provider.keyUrl)} />
            {stored.includes(provider.id) ? (
              <Button title="Remove" danger onPress={() => void clearCloudKey(provider.id).then(refresh)} />
            ) : null}
          </Row>
        </View>
      ))}
    </Card>
  );
}
