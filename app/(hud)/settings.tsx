import { useEffect, useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, Field, Row, Screen, Title } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import { importGgufModel, removeImportedModel } from '@/lib/inference/modelImport';
import { eraseAllJarvisData, listRecentToolRuns } from '@/lib/storage/database';
import { clearTermuxSecret, setTermuxSecret } from '@/lib/tools/termuxClient';
import { errorMessage, humanizeError } from '@/lib/utils/errors';
import { formatPerformance } from '@/lib/inference/performance';
import { describeVoices, previewVoice, setVoicePreference } from '@/lib/voice/voiceResponse';

type ToolRun = Awaited<ReturnType<typeof listRecentToolRuns>>[number];

export default function SettingsScreen() {
  const jarvis = useJarvis();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const [termuxSecret, setTermuxSecretInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<number | null>(null);
  const [termuxStatus, setTermuxStatus] = useState('Not checked');
  const [toolRuns, setToolRuns] = useState<ToolRun[]>([]);
  const [ownerProfileDraft, setOwnerProfileDraft] = useState('');
  const [wakeWordDraft, setWakeWordDraft] = useState('jarvis');
  const [voiceReport, setVoiceReport] = useState<Awaited<ReturnType<typeof describeVoices>>>();
  const [loadingVoices, setLoadingVoices] = useState(false);

  const section = Array.isArray(params.section) ? params.section[0] : params.section;

  async function refreshDiagnostics() {
    setToolRuns(await listRecentToolRuns(8));
  }

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  useEffect(() => {
    setOwnerProfileDraft(jarvis.settings.ownerProfile);
    setWakeWordDraft(jarvis.settings.wakeWord);
  }, [jarvis.settings.ownerProfile, jarvis.settings.wakeWord]);

  async function refreshVoices() {
    setLoadingVoices(true);
    try {
      setVoiceReport(await describeVoices(jarvis.settings.language));
    } catch (error) {
      Alert.alert('Voices unavailable', humanizeError(errorMessage(error)));
    } finally {
      setLoadingVoices(false);
    }
  }

  useEffect(() => {
    // Push the owner's choice into the speech layer whenever it changes, then
    // re-read the device so this card shows what will actually be spoken with,
    // not what was chosen under the previous preference.
    setVoicePreference({
      allowNetwork: jarvis.settings.ttsAllowNetworkVoice,
      preferredIdentifier: jarvis.settings.ttsVoiceId,
    });
    describeVoices(jarvis.settings.language).then(setVoiceReport).catch(() => undefined);
  }, [jarvis.settings.ttsAllowNetworkVoice, jarvis.settings.ttsVoiceId, jarvis.settings.language]);

  async function validateAndSelectModel(
    imported: { path: string; name: string; size: number },
    successTitle: string,
    autoLoad = false,
  ) {
    try {
      if (Platform.OS === 'android') await jarvis.validateModel(imported.path);
    } catch (error) {
      removeImportedModel(imported.path);
      throw new Error(`GGUF validation failed: ${errorMessage(error)}`);
    }

    await jarvis.updateSettings({ modelPath: imported.path, modelName: imported.name, modelSize: imported.size });
    if (autoLoad) await jarvis.loadModel({ path: imported.path, name: imported.name });
    Alert.alert(successTitle, `${imported.name}\n${(imported.size / 1024 / 1024).toFixed(1)} MB${autoLoad ? '\nJARVIS brain: READY' : ''}`);
  }

  async function importModel() {
    if (importing) return;
    setImporting(true);
    try {
      const imported = await importGgufModel();
      if (!imported) return;
      await validateAndSelectModel(imported, 'Model imported and validated');
    } catch (error) {
      const code = errorMessage(error, 'MODEL_IMPORT_FAILED');
      Alert.alert('Import failed', humanizeError(code));
    } finally {
      setImporting(false);
    }
  }

  async function downloadFreeBrain() {
    if (importing) return;
    setImporting(true);
    setModelDownloadProgress(0);
    try {
      const imported = await jarvis.installRecommendedModel(setModelDownloadProgress);
      Alert.alert(
        'Free local brain downloaded',
        `${imported.name}\n${(imported.size / 1024 / 1024).toFixed(1)} MB\nJARVIS brain: READY`,
      );
    } catch (error) {
      const code = errorMessage(error, 'MODEL_DOWNLOAD_FAILED');
      Alert.alert('Download failed', humanizeError(code));
    } finally {
      setModelDownloadProgress(null);
      setImporting(false);
    }
  }

  async function checkTermux() {
    setTermuxStatus('Checking…');
    try {
      const result = await jarvis.ask('termux status', 'fast');
      setTermuxStatus(result.text);
    } catch (error) {
      const code = errorMessage(error, 'TERMUX_UNAVAILABLE');
      setTermuxStatus(humanizeError(code));
    } finally {
      await refreshDiagnostics();
    }
  }

  return (
    <Screen>
      <Title>Settings</Title>
      {section === 'diagnostics' ? <AppText muted>Opened from /status · diagnostics are below.</AppText> : null}

      <Card title="Model">
        <AppText>{jarvis.settings.modelName ?? 'No GGUF selected'}</AppText>
        {jarvis.settings.modelSize ? <AppText muted>{(jarvis.settings.modelSize / 1024 / 1024).toFixed(1)} MB</AppText> : null}
        {modelDownloadProgress !== null ? (
          <AppText muted>Downloading free local brain: {Math.round(modelDownloadProgress * 100)}%</AppText>
        ) : null}
        <Row>
          <Button
            title={modelDownloadProgress !== null ? `Downloading… ${Math.round(modelDownloadProgress * 100)}%` : 'Download free local brain'}
            disabled={importing}
            onPress={() => void downloadFreeBrain()}
          />
          <Button title={importing ? 'Working…' : 'Import your GGUF'} disabled={importing} onPress={() => void importModel()} />
          <Button
            title="Load"
            disabled={!jarvis.settings.modelPath || jarvis.modelState.status === 'loading'}
            onPress={() => void jarvis.loadModel().catch((error) => Alert.alert('Load failed', humanizeError(errorMessage(error))))}
          />
          <Button title="Unload" disabled={jarvis.modelState.status === 'unloaded'} onPress={() => void jarvis.unloadModel()} />
        </Row>
        <AppText muted>Status: {jarvis.modelState.status} · GPU: {String(jarvis.modelState.gpu ?? false)}</AppText>
        {jarvis.modelState.reasonNoGPU ? <AppText muted>Acceleration note: {jarvis.modelState.reasonNoGPU}</AppText> : null}
        {jarvis.modelState.error ? <AppText muted>Error: {jarvis.modelState.error}</AppText> : null}
      </Card>

      <Card title="Local runtime">
        <Row>
          <Button
            title={jarvis.settings.adaptiveRuntime ? 'Adaptive sizing: ON' : 'Adaptive sizing: OFF'}
            onPress={() => void jarvis.updateSettings({ adaptiveRuntime: !jarvis.settings.adaptiveRuntime })}
          />
        </Row>

        {jarvis.activeRuntimePlan ? (
          <>
            <AppText>Running tier: {jarvis.activeRuntimePlan.tier}</AppText>
            <AppText>Context: {jarvis.activeRuntimePlan.contextSize}</AppText>
            <AppText>Batch: {jarvis.activeRuntimePlan.batchSize}</AppText>
            <AppText>Threads: {jarvis.activeRuntimePlan.threads}</AppText>
            <AppText>GPU layers requested: {jarvis.activeRuntimePlan.gpuLayers}</AppText>
            <AppText muted>Reason: {jarvis.activeRuntimePlan.reason}</AppText>
            <AppText muted>
              Thermal reading: {jarvis.activeRuntimePlan.thermalSignalPresent ? 'present' : 'not measured'}
            </AppText>
          </>
        ) : (
          <>
            <AppText muted>No model loaded, so no runtime is active.</AppText>
            <AppText muted>
              Configured: context {jarvis.settings.contextSize} · batch {jarvis.settings.batchSize} · threads{' '}
              {jarvis.settings.threads} · GPU layers {jarvis.settings.gpuLayers}
            </AppText>
          </>
        )}

        {jarvis.powerReading ? (
          <>
            <AppText muted>
              Battery:{' '}
              {typeof jarvis.powerReading.state.batteryLevel === 'number'
                ? `${Math.round(jarvis.powerReading.state.batteryLevel * 100)}%`
                : 'N/A'}
              {' · '}
              Charging:{' '}
              {typeof jarvis.powerReading.state.charging === 'boolean'
                ? String(jarvis.powerReading.state.charging)
                : 'N/A'}
              {' · '}
              RAM:{' '}
              {typeof jarvis.powerReading.state.totalRamGb === 'number'
                ? `${jarvis.powerReading.state.totalRamGb} GB`
                : 'N/A'}
            </AppText>
            {jarvis.powerReading.unavailable.map((note) => (
              <AppText key={note} muted>
                Unavailable: {note}
              </AppText>
            ))}
          </>
        ) : null}

        <AppText muted>{formatPerformance(jarvis.lastMetrics)}</AppText>
      </Card>

      <Card title="Default intelligence">
        <Row>
          {(['fast', 'deep', 'create', 'code'] as const).map((mode) => (
            <Button key={mode} title={mode.toUpperCase()} onPress={() => void jarvis.updateSettings({ defaultMode: mode })} />
          ))}
        </Row>
        <AppText muted>Current: {jarvis.settings.defaultMode}</AppText>
      </Card>

      <Card title="Language & voice">
        <Row>
          <Button title="English" onPress={() => void jarvis.updateSettings({ language: 'en' })} />
          <Button title="Arabic" onPress={() => void jarvis.updateSettings({ language: 'ar' })} />
        </Row>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText>Auto speak responses</AppText>
          <Switch value={jarvis.settings.autoSpeak} onValueChange={(value) => void jarvis.updateSettings({ autoSpeak: value })} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText>Hands-free Jarvis</AppText>
          <Switch
            value={jarvis.settings.handsFreeEnabled}
            onValueChange={(value) => void jarvis.updateSettings({ handsFreeEnabled: value })}
          />
        </View>
        <Field value={wakeWordDraft} onChangeText={setWakeWordDraft} placeholder="Wake word, e.g. Jarvis" />
        <Button
          title="Save wake word"
          disabled={!wakeWordDraft.trim()}
          onPress={() => void jarvis.updateSettings({ wakeWord: wakeWordDraft.trim() })}
        />
        <AppText muted>
          When hands-free is on, JARVIS starts listening from the visible app and keeps that microphone session alive while the app is minimized using an Android foreground microphone service.
        </AppText>
      </Card>

      <Card title="Voice quality">
        <AppText>
          In use: {voiceReport?.chosen ? `${voiceReport.chosen.voice.name}` : 'Not selected yet'}
        </AppText>
        <AppText muted>
          {voiceReport?.chosen
            ? `${voiceReport.chosen.voice.identifier} — ${voiceReport.chosen.reason}`
            : 'Tap Refresh to read the voices installed on this phone.'}
        </AppText>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText>Use online voices when available</AppText>
          <Switch
            value={jarvis.settings.ttsAllowNetworkVoice}
            onValueChange={(value) => void jarvis.updateSettings({ ttsAllowNetworkVoice: value })}
          />
        </View>
        <AppText muted>
          Google&apos;s network voices are the most natural, but they are synthesised on a server: they need internet and add
          delay before JARVIS starts speaking. Off keeps every reply on-device.
        </AppText>

        <Row>
          <Button title={loadingVoices ? 'Reading…' : 'Refresh voices'} disabled={loadingVoices} onPress={() => void refreshVoices()} />
          {voiceReport?.chosen ? (
            <Button
              title="Hear it"
              onPress={() => void previewVoice(voiceReport.chosen!.voice.identifier, jarvis.settings.language)}
            />
          ) : null}
          {jarvis.settings.ttsVoiceId ? (
            <Button title="Unpin" onPress={() => void jarvis.updateSettings({ ttsVoiceId: undefined })} />
          ) : null}
        </Row>

        {voiceReport?.candidates.length ? (
          <>
            <AppText muted>
              Installed voices for {jarvis.settings.language === 'ar' ? 'Arabic' : 'English'}, best first. Tap one to hear it,
              then pin it to keep it.
            </AppText>
            {voiceReport.candidates.slice(0, 6).map((candidate) => (
              <Row key={candidate.voice.identifier}>
                <Button
                  title={`Hear ${candidate.voice.name}`}
                  onPress={() => void previewVoice(candidate.voice.identifier, jarvis.settings.language)}
                />
                <Button
                  title={jarvis.settings.ttsVoiceId === candidate.voice.identifier ? 'Pinned' : 'Pin'}
                  disabled={jarvis.settings.ttsVoiceId === candidate.voice.identifier}
                  onPress={() => void jarvis.updateSettings({ ttsVoiceId: candidate.voice.identifier })}
                />
              </Row>
            ))}
          </>
        ) : voiceReport ? (
          <AppText muted>
            This phone reports no {jarvis.settings.language === 'ar' ? 'Arabic' : 'English'} voice. Install Google
            Text-to-Speech, then open Android Settings → System → Languages → Text-to-speech output and download the voice
            data.
          </AppText>
        ) : null}
      </Card>

      <Card title="Owner profile">
        <AppText muted>These preferences stay in JARVIS local settings and are included in its prompt so it understands how you want it to work and reply.</AppText>
        <Field value={ownerProfileDraft} onChangeText={setOwnerProfileDraft} placeholder="Tell JARVIS how you work and what you prefer…" multiline />
        <Button
          title="Save owner profile"
          disabled={!ownerProfileDraft.trim()}
          onPress={() => void jarvis.updateSettings({ ownerProfile: ownerProfileDraft.trim() })}
        />
      </Card>

      <Card title="Android assistant">
        <AppText>
          After installing the APK: Phone Settings → Apps → Default apps → Digital assistant app → choose JARVIS ROG.
        </AppText>
        <AppText muted>
          This lets Android keep the assistant service available and lets the phone&apos;s assistant gesture / power-button shortcut invoke JARVIS.
        </AppText>
        <Button title="Open JARVIS Android settings" onPress={() => void jarvis.ask('open settings', 'fast')} />
      </Card>

      <Card title="Memory">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText>Approved memory injection</AppText>
          <Switch value={jarvis.settings.approvedMemoryEnabled} onValueChange={(value) => void jarvis.updateSettings({ approvedMemoryEnabled: value })} />
        </View>
      </Card>

      <Card title="Termux bridge">
        <AppText muted>Paste the secret generated by termux/install.sh. It is stored with SecureStore.</AppText>
        <Field value={termuxSecret} onChangeText={setTermuxSecretInput} placeholder="JARVIS_IPC_SECRET" />
        <Row>
          <Button
            title="Save secret"
            disabled={!termuxSecret.trim()}
            onPress={() => void setTermuxSecret(termuxSecret).then(() => {
              setTermuxSecretInput('');
              setTermuxStatus('Configured · not checked');
            })}
          />
          <Button title="Check bridge" onPress={() => void checkTermux()} />
          <Button title="Forget secret" danger onPress={() => void clearTermuxSecret().then(() => setTermuxStatus('Not configured'))} />
        </Row>
        <AppText muted>{termuxStatus}</AppText>
      </Card>

      <Card title="Diagnostics">
        <AppText>Database: {jarvis.initError ? `ERROR · ${jarvis.initError}` : 'READY'}</AppText>
        <AppText>Model: {jarvis.modelState.status}</AppText>
        <AppText>Active project: {jarvis.activeProject?.name ?? 'None'}</AppText>
        <AppText>Memories: {jarvis.memories.length}</AppText>
        <AppText>Projects: {jarvis.projects.length}</AppText>
        <Button title="Refresh diagnostics" onPress={() => void refreshDiagnostics()} />
        {toolRuns.length ? toolRuns.map((run) => (
          <AppText key={run.id} muted>{run.ok ? 'PASS' : 'FAIL'} · {run.tool} · {Math.max(0, run.finishedAt - run.startedAt)} ms{run.error ? ` · ${run.error}` : ''}</AppText>
        )) : <AppText muted>No tool runs recorded yet.</AppText>}
      </Card>

      <Card title="Data">
        <Button title="Erase all JARVIS data" danger onPress={() => Alert.alert('Erase all local data?', 'This deletes chats, projects, memories, settings and tool logs.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Erase', style: 'destructive', onPress: () => void eraseAllJarvisData().then(() => jarvis.refresh()) },
        ])} />
      </Card>
    </Screen>
  );
}
