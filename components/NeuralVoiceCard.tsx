import { useSyncExternalStore } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { AppText, Button, Card } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import { getNeuralVoiceStatus, previewNeuralVoice, subscribeNeuralVoice } from '@/lib/voice/neuralVoiceStore';

/**
 * The switch for Kokoro, the on-device neural voice.
 *
 * The voice itself is loaded by the HUD, which stays mounted under this
 * sheet. This card only reads its status — mounting the voice here too would
 * load a second ~351 MB copy into memory.
 */
export function NeuralVoiceCard() {
  const jarvis = useJarvis();
  const status = useSyncExternalStore(subscribeNeuralVoice, getNeuralVoiceStatus, getNeuralVoiceStatus);
  const enabled = jarvis.settings.neuralVoiceEnabled;

  const state = !enabled
    ? 'Off'
    : status.error
      ? `Error: ${status.error}`
      : status.unavailableReason
        ? status.unavailableReason
        : status.ready
          ? 'Ready — English replies use this voice'
          : `Downloading · ${Math.round(status.progress * 100)}%`;

  async function preview() {
    const spoke = await previewNeuralVoice('Good evening, Smiley. All systems are online, and I am ready when you are.');
    if (!spoke) Alert.alert('Voice not ready', 'The neural voice is still downloading or loading.');
  }

  return (
    <Card title="Human voice (neural)">
      <View style={styles.row}>
        <AppText>Speak with Kokoro — British male, on-device</AppText>
        <Switch value={enabled} onValueChange={(value) => void jarvis.updateSettings({ neuralVoiceEnabled: value })} />
      </View>
      <AppText muted>
        A neural voice that runs entirely on the phone, so it works offline and nothing you hear is generated on a server.
        One-time download of about 351 MB — best on Wi-Fi. English only: Kokoro has no Arabic voice, so Arabic replies keep
        using the phone&apos;s best voice below.
      </AppText>
      <AppText>Status: {state}</AppText>
      {enabled && status.ready ? <Button title="Hear it" onPress={() => void preview()} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
