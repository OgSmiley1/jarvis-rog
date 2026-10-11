import { toolRegistry } from '@/lib/tools/registry';
import { executeTool } from '@/lib/tools/router';
import { ToolConversation } from '@/lib/tools/toolConversation';
import { checkProvider } from '@/lib/net/providerPolicy';
import { CORE_PRESETS } from '@/lib/core/CorePresets';
import { toolEvidence } from './toolEvidence';
import { isLocalOnly } from '@/lib/net/localOnly';
export type CheckStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED' | 'UNVERIFIED';
export interface CheckResult { name: string; status: CheckStatus; detail: string }
export interface SelfTestInput {
  modelPresent: boolean; modelReady: boolean; rendererMounted?: boolean; rendererError?: boolean;
  microphoneGranted?: boolean; sttReady?: boolean; ttsVoices?: number;
  microphoneCaptureAt?: number; transcriptAt?: number;
  infer?: (signal: AbortSignal) => Promise<string | { text: string; firstTokenMs?: number; totalMs: number }>;
  backendName?: string;
  backendInfer?: (signal: AbortSignal) => Promise<string | { text: string; firstTokenMs?: number; totalMs: number }>;
}
export async function runSelfTest(input: SelfTestInput): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const add = (name: string, status: CheckStatus, detail: string) => results.push({ name, status, detail });
  const check = (name: string, ok: boolean, detail: string) => add(name, ok ? 'PASS' : 'FAIL', detail);
  check('Core presets', Object.values(CORE_PRESETS).every((p) => Object.values(p).every(Number.isFinite)), 'All state parameters are finite.');
  add('Core renderer', input.rendererError ? 'FAIL' : 'UNVERIFIED', input.rendererMounted ? 'Component mounted; visible animation requires visual verification.' : 'No mounted renderer observation.');
  check('Tool registry', toolRegistry.size > 0 && [...toolRegistry].every(([id, t]) => id === t.name && typeof t.schema.safeParse === 'function' && t.timeoutMs > 0 && t.localOnlyCompatible === !t.network), `${toolRegistry.size} typed tools with execution and policy metadata.`);
  const calculator = await executeTool({ id: 'self-test', tool: 'utility.calculate', arguments: { expression: '6*7', lang: 'en' } });
  check('Local calculator', calculator.ok && JSON.stringify(calculator.data).includes('42'), calculator.ok ? 'Executed 6×7 through the real tool router.' : calculator.error ?? 'No result');
  const context = new ToolConversation();
  context.resolve('weather in Ajman tomorrow');
  const follow = context.resolve('what about Dubai?');
  check('Contextual follow-up', follow?.call.tool === 'live.weather' && follow.call.arguments.day === 'tomorrow' && String(follow.call.arguments.city).toLowerCase() === 'dubai', 'Ajman tomorrow → Dubai tomorrow.');
  check('Local Only policy', !checkProvider('open-meteo', { strict: true, localOnly: true }).allowed && !checkProvider('cerebras', { strict: true, localOnly: true }).allowed, 'Weather and remote AI policy denied without making a request.');
  add('Model file', input.modelPresent ? 'PASS' : 'BLOCKED', input.modelPresent ? 'Compatible model file observed on disk.' : 'Install the one-time local brain.');
  add('Model state', input.modelReady ? 'PASS' : 'BLOCKED', input.modelReady ? 'Native context reports loaded.' : 'Local model is not loaded.');
  if (input.modelReady && input.infer) {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('Inference exceeded 20 seconds')); }, 20_000); });
      const response = await Promise.race([input.infer(abort.signal), timeout]);
      const text = typeof response === 'string' ? response : response.text;
      const timing = typeof response === 'string' ? '' : ` First token: ${response.firstTokenMs === undefined ? 'unmeasured' : Math.round(response.firstTokenMs) + ' ms'}; total ${Math.round(response.totalMs)} ms.`;
      check('Local inference', text.trim().length > 0, text.trim() ? 'Local runtime returned text without a cloud provider.' + timing : 'Empty model reply.');
    } catch (error) { add('Local inference', 'FAIL', error instanceof Error ? error.message : 'Inference failed'); }
    finally { if (timer) clearTimeout(timer); }
  } else add('Local inference', 'BLOCKED', 'A loaded local model is required.');
  if (input.backendInfer) {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('Backend inference exceeded 20 seconds')); }, 20_000); });
      const response = await Promise.race([input.backendInfer(abort.signal), timeout]);
      const text = typeof response === 'string' ? response : response.text;
      const timing = typeof response === 'string' ? '' : ` First token: ${response.firstTokenMs === undefined ? 'unmeasured' : Math.round(response.firstTokenMs) + ' ms'}; total ${Math.round(response.totalMs)} ms.`;
      check(`${input.backendName ?? 'Backend'} inference`, text.trim().length > 0, text.trim() ? 'A real local backend request returned text.' + timing : 'Empty backend reply.');
    } catch (error) { add(`${input.backendName ?? 'Backend'} inference`, 'FAIL', error instanceof Error ? error.message : 'Backend inference failed'); }
    finally { if (timer) clearTimeout(timer); }
  } else add('Ollama inference', 'SKIPPED', 'Ollama local is not enabled.');
  add('Microphone permission', input.microphoneGranted === undefined ? 'UNVERIFIED' : input.microphoneGranted ? 'PASS' : 'BLOCKED', 'Permission check only; no microphone recording performed.');
  add('Microphone capture', input.microphoneCaptureAt ? 'PASS' : 'UNVERIFIED', input.microphoneCaptureAt ? `Audio frames observed this app session at ${new Date(input.microphoneCaptureAt).toISOString()}; quality is not assessed.` : 'No microphone frames observed this session.');
  add('Speech transcription', input.transcriptAt ? 'PASS' : 'UNVERIFIED', input.transcriptAt ? `Local STT produced text this app session at ${new Date(input.transcriptAt).toISOString()}; accuracy requires listening.` : 'No actual transcription observed this session.');
  add('Speech model', input.sttReady === undefined ? 'UNVERIFIED' : input.sttReady ? 'PASS' : 'BLOCKED', 'Observed STT graph readiness; not a speech-quality test.');
  add('TTS voices', input.ttsVoices === undefined ? 'UNVERIFIED' : input.ttsVoices > 0 ? 'PASS' : 'BLOCKED', `${input.ttsVoices ?? 'Unknown'} voices enumerated; audible playback unverified.`);
  add('Phone actions / speech / restart', 'UNVERIFIED', 'Requires interactive Android checks; no call, alarm or message was triggered.');
  add('Hosted providers', 'SKIPPED', 'Self-test makes no external network requests.');
  for (const tool of toolRegistry.values()) {
    const observed = toolEvidence(tool.name);
    const registered = typeof tool.execute === 'function' && typeof tool.schema.safeParse === 'function';
    const blocked = isLocalOnly() && tool.network;
    const status: CheckStatus = !registered ? 'FAIL' : blocked ? 'BLOCKED' : observed ? observed.ok ? 'PASS' : 'FAIL' : 'UNVERIFIED';
    add(`Feature: ${tool.name}`, status,
      !registered ? 'Registry definition invalid.' : blocked ? 'Blocked by Local Only.' : observed
        ? `${observed.ok ? 'Handler returned' : 'Handler failed'} · ${observed.ms} ms · ${new Date(observed.at).toISOString()}${observed.error ? ' · ' + observed.error : ''}. Device action and result quality require confirmation.`
        : `Registry verified; handler not exercised this session. ${tool.permissions.length ? 'Permissions: ' + tool.permissions.join(', ') + '. ' : ''}${tool.confirmation === 'required' ? 'Requires confirmation. ' : ''}Availability: ${tool.availability}.`);
  }
  return results;
}
