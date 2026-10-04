import { beforeEach, expect, it, vi } from 'vitest';

// Drive the hook's asynchronous permission/recorder lifecycle without a native
// microphone. State setters and effects are observed; this is not device proof.
const harness = vi.hoisted(() => ({
  permission: vi.fn<(...args: unknown[]) => Promise<string>>(),
  recorderStart: vi.fn(),
  recorderStop: vi.fn(),
  streamStop: vi.fn(),
  setState: vi.fn(),
  cleanups: [] as (() => void)[],
}));
vi.mock('react', () => ({
  useRef: <T>(current: T) => ({ current }),
  useMemo: <T>(fn: () => T) => fn(),
  useCallback: <T>(fn: T) => fn,
  useState: <T>(value: T) => [value, harness.setState],
  useEffect: (fn: () => (() => void) | undefined) => {
    const cleanup = fn();
    if (cleanup) harness.cleanups.push(cleanup);
  },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 36 },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Linking: { openSettings: vi.fn() },
  PermissionsAndroid: {
    PERMISSIONS: { RECORD_AUDIO: 'mic', POST_NOTIFICATIONS: 'notification' },
    RESULTS: { GRANTED: 'granted' },
    check: async () => false,
    request: harness.permission,
  },
}));
vi.mock('react-native-audio-api', () => ({
  AudioRecorder: class {
    start = harness.recorderStart;
    stop = harness.recorderStop;
    onAudioReady() {}
  },
}));
vi.mock('react-native-executorch', () => ({
  models: { speech_to_text: { whisper_tiny: () => ({}) }, vad: { fsmn_vad: () => ({}) } },
  useSpeechToText: () => ({
    isReady: true,
    streamStop: harness.streamStop,
    stream: async function* () {},
  }),
}));
vi.mock('@/lib/voice/executorch', () => ({ ensureExecutorch() {} }));
vi.mock('@/hooks/useLocalVoiceModel', () => ({
  useLocalVoiceModel: () => ({ ready: true, config: { model: {}, vad: {} } }),
}));
import { useLiveVoice } from '@/hooks/useLiveVoice.native';

beforeEach(() => {
  vi.clearAllMocks();
  harness.cleanups.length = 0;
  harness.permission.mockResolvedValue('granted');
});

it('Stop during microphone permission prevents late recorder startup', async () => {
  let grant!: (value: string) => void;
  harness.permission.mockReturnValueOnce(new Promise((resolve) => { grant = resolve; }));
  const voice = useLiveVoice({ language: 'en' });
  const starting = voice.start();
  await voice.stop();
  grant('granted');
  await starting;
  expect(harness.recorderStart).not.toHaveBeenCalled();
});

it('Stop during notification permission prevents late recorder startup', async () => {
  let grant!: (value: string) => void;
  harness.permission.mockResolvedValueOnce('granted').mockReturnValueOnce(new Promise((resolve) => { grant = resolve; }));
  const voice = useLiveVoice({ language: 'en' });
  const starting = voice.start();
  await vi.waitFor(() => expect(harness.permission).toHaveBeenCalledTimes(2));
  await voice.stop();
  grant('granted');
  await starting;
  expect(harness.recorderStart).not.toHaveBeenCalled();
});

it('unmount invalidates a pending permission request', async () => {
  let grant!: (value: string) => void;
  harness.permission.mockReturnValueOnce(new Promise((resolve) => { grant = resolve; }));
  const voice = useLiveVoice({ language: 'en' });
  const starting = voice.start();
  harness.cleanups.forEach((cleanup) => cleanup());
  grant('granted');
  await starting;
  expect(harness.recorderStart).not.toHaveBeenCalled();
});

it('repeated Start while awaiting permission makes only one permission request', async () => {
  let grant!: (value: string) => void;
  harness.permission.mockReturnValueOnce(new Promise((resolve) => { grant = resolve; }));
  const voice = useLiveVoice({ language: 'en' });
  const starting = voice.start();
  await voice.start();
  await vi.waitFor(() => expect(harness.permission).toHaveBeenCalledTimes(1));
  grant('granted');
  await starting;
  expect(harness.recorderStart).toHaveBeenCalledTimes(1);
  await voice.stop();
});

it('a rejected permission request leaves Start retryable', async () => {
  harness.permission.mockRejectedValueOnce(new Error('permission failed'));
  const voice = useLiveVoice({ language: 'en' });
  await voice.start();
  expect(harness.setState).toHaveBeenCalledWith('ERROR');
  await voice.start();
  expect(harness.recorderStart).toHaveBeenCalledTimes(1);
  await voice.stop();
});

it('an old permission result cannot cancel a newer pending Start', async () => {
  let firstGrant!: (value: string) => void;
  let secondGrant!: (value: string) => void;
  harness.permission
    .mockReturnValueOnce(new Promise((resolve) => { firstGrant = resolve; }))
    .mockReturnValueOnce(new Promise((resolve) => { secondGrant = resolve; }));
  const voice = useLiveVoice({ language: 'en' });
  const first = voice.start();
  await voice.stop();
  const second = voice.start();
  firstGrant('granted');
  await first;
  await voice.start();
  expect(harness.permission).toHaveBeenCalledTimes(2);
  expect(harness.recorderStart).not.toHaveBeenCalled();
  secondGrant('granted');
  await second;
  expect(harness.recorderStart).toHaveBeenCalledTimes(1);
  await voice.stop();
});
