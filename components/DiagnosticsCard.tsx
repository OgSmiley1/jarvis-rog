import { useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import { Paths } from 'expo-file-system';
import { AppText, Button, Card } from './Ui';
import { useJarvis } from '@/context/JarvisContext';
import { findInstalledModel, readMemoryInfo } from '@/lib/inference/brainStore';
import { describeVoices } from '@/lib/voice/voiceResponse';
import { toolRegistry } from '@/lib/tools/registry';
import { formatLatencyReport } from '@/lib/telemetry/stageTimer';
import { runSelfTest, type CheckResult } from '@/lib/diagnostics/selfTest';
import { runtimeObservations } from '@/lib/diagnostics/runtime';
import { humanizeError, errorMessage } from '@/lib/utils/errors';

export function DiagnosticsCard() {
  const jarvis = useJarvis();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [device, setDevice] = useState('Press Run Self-Test to read current device and subsystem status.');
  const tools = [...toolRegistry.values()];
  async function run() {
    if (['thinking', 'local_inference', 'tool_execution', 'online_lookup'].includes(runtimeObservations.coreState ?? '')) {
      setResults([{ name: 'Self-test', status: 'BLOCKED', detail: 'Finish or stop the current request before testing inference.' }]);
      return;
    }
    setBusy(true);
    try {
      const model = findInstalledModel({ path: jarvis.settings.modelPath, name: jarvis.settings.modelName });
      const [mic, voices, network] = await Promise.allSettled([
        Platform.OS === 'android' ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO) : Promise.resolve(false),
        describeVoices(jarvis.settings.language), Network.getNetworkStateAsync(),
      ]);
      const memory = readMemoryInfo();
      setDevice([
        `Android ${Device.osVersion ?? 'unknown'} · ABI ${Device.supportedCpuArchitectures?.join(', ') ?? 'unknown'}`,
        `RAM ${Device.totalMemory ? (Device.totalMemory / 1024 ** 3).toFixed(1) + ' GiB' : 'unknown'} · Available RAM: ${memory ? (memory.availableBytes / 1024 ** 3).toFixed(1) + ' GiB' : 'unknown'}`,
        `Storage ${(Paths.availableDiskSpace / 1024 ** 3).toFixed(1)} GiB free`,
        `Connectivity: ${network.status === 'fulfilled' ? String(network.value.isConnected) : 'UNVERIFIED'}`,
        `Brain: ${model?.name ?? 'absent'} · ${model?.size ?? 'unknown'} bytes`,
        `Path: ${model?.path ?? jarvis.settings.modelPath ?? 'none'}`,
        `Core: ${runtimeObservations.coreState ?? 'UNVERIFIED'} · Speech: ${runtimeObservations.sttState ?? 'UNVERIFIED'}`,
        `Voice: ${voices.status === 'fulfilled' ? voices.value.chosen?.voice.identifier ?? 'none' : 'UNVERIFIED'}`,
      ].join('\n'));
      setResults(await runSelfTest({
        modelPresent: Boolean(model), modelReady: jarvis.modelState.status === 'ready',
        ...runtimeObservations,
        microphoneGranted: mic.status === 'fulfilled' ? mic.value : undefined,
        ttsVoices: voices.status === 'fulfilled' ? voices.value.candidates.length : undefined,
        infer: async (signal) => {
          // Direct local runtime: self-test must never fall back to a cloud brain.
          const runtime = await import('@/lib/inference/standaloneModel');
          const result = await runtime.runCompletion({ messages: [{ role: 'user', content: 'Reply with READY.' }], mode: 'fast', maxTokens: 12, signal });
          return { text: result.text, firstTokenMs: result.metrics.firstTokenMs, totalMs: result.metrics.totalMs };
        },
      }));
    } catch (error) { setResults([{ name: 'Self-test', status: 'FAIL', detail: humanizeError(errorMessage(error)) }]); }
    finally { setBusy(false); }
  }
  return <Card title="System diagnostics">
    <AppText>JARVIS {Constants.expoConfig?.version ?? 'unknown'} · build {Constants.expoConfig?.android?.versionCode ?? 'unknown'}</AppText>
    <AppText muted>Source: {Constants.expoConfig?.extra?.buildCommit ?? 'UNVERIFIED'}</AppText>
    <AppText>{jarvis.modelState.status === 'ready' ? 'Local model loaded · run inference self-test to verify generation' : `Brain ${jarvis.modelState.status}`}</AppText>
    <AppText>Local Only: {jarvis.settings.localOnly ? 'ON' : 'OFF'} · Tools: {tools.length} registered · {jarvis.settings.localOnly ? tools.filter(t => t.network).length : 0} policy blocked · {tools.filter(t => t.permissions.length).length} permission dependent</AppText>
    <AppText muted>Runtime availability depends on permissions, installed Android handlers and configured providers; registry counts do not prove availability.</AppText>
    <AppText>{device}</AppText>
    <AppText muted>{formatLatencyReport()}</AppText>
    {jarvis.lastMetrics ? <AppText>Last request: {Math.round(jarvis.lastMetrics.totalMs)} ms · first token {jarvis.lastMetrics.firstTokenMs ?? 'unmeasured'} ms</AppText> : null}
    <Button title={busy ? 'Testing…' : 'Run Self-Test'} disabled={busy} onPress={() => void run()} />
    {results.map(result => <AppText key={result.name}>{result.status} · {result.name}: {result.detail}</AppText>)}
  </Card>;
}
