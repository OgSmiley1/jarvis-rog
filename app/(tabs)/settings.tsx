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

type ToolRun = Awaited<ReturnType<typeof listRecentToolRuns>>[number];

export default function SettingsScreen() {
  const jarvis = useJarvis();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const [termuxSecret, setTermuxSecretInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [termuxStatus, setTermuxStatus] = useState('Not checked');
  const [toolRuns, setToolRuns] = useState<ToolRun[]>([]);

  const section = Array.isArray(params.section) ? params.section[0] : params.section;

  async function refreshDiagnostics() {
    setToolRuns(await listRecentToolRuns(8));
  }

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  async function importModel() {
    if (importing) return;
    setImporting(true);
    try {
      const imported = await importGgufModel();
      if (!imported) return;

      try {
        if (Platform.OS === 'android') await jarvis.validateModel(imported.path);
      } catch (error) {
        removeImportedModel(imported.path);
        throw new Error(`GGUF validation failed: ${errorMessage(error)}`);
      }

      await jarvis.updateSettings({ modelPath: imported.path, modelName: imported.name, modelSize: imported.size });
      Alert.alert('Model imported and validated', `${imported.name}\n${(imported.size / 1024 / 1024).toFixed(1)} MB`);
    } catch (error) {
      const code = errorMessage(error, 'MODEL_IMPORT_FAILED');
      Alert.alert('Import failed', humanizeError(code));
    } finally {
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
        <Row>
          <Button title={importing ? 'Importing…' : 'Import + validate GGUF'} disabled={importing} onPress={() => void importModel()} />
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
        <AppText>Context: {jarvis.settings.contextSize}</AppText>
        <AppText>Batch: {jarvis.settings.batchSize}</AppText>
        <AppText>Threads: {jarvis.settings.threads}</AppText>
        <AppText>GPU layers requested: {jarvis.settings.gpuLayers}</AppText>
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
        <AppText muted>The microphone is used only during a visible session. Background microphone service is disabled in this build.</AppText>
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
