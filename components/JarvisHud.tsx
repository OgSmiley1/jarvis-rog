import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, PanResponder, Platform, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, Row } from '@/components/Ui';
import { HudDrawer } from '@/components/HudDrawer';
import { JarvisOrb } from '@/components/JarvisOrb';
import { DashboardClock } from '@/components/DashboardClock';
import { FirstRunCard, HistoryList, QrView, Sheet, type HistoryItem } from '@/components/CoreSheets';
import { CameraPage } from '@/components/CameraPage';
import { colors } from '@/components/theme';
import { useJarvis, type AnswerSource } from '@/context/JarvisContext';
import { providerById } from '@/lib/online/cloudBrain';
import type { CompletionMessage, IntelligenceMode } from '@/lib/inference/types';
import { appendExchange } from '@/lib/hud/conversation';
import { describeHud, orbTapStartsVoice } from '@/lib/hud/hudState';
import { formatPerformance } from '@/lib/inference/performance';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';
import { followUpCommand, type LiveContext } from '@/lib/tools/liveRoutes';
import { ECHO_SAFE, bargeInDecision, haltAcknowledgement, isHaltCommand } from '@/lib/voice/bargeIn';
import { SpeechStream } from '@/lib/voice/speechStream';
import { FILLER_AFTER_MS, thinkingFiller } from '@/lib/voice/thinkingFiller';
import { speakQueued, speakResponse, stopSpeaking } from '@/lib/voice/voiceResponse';
import { extractWakeCommand } from '@/lib/voice/wakeWord';
import { wakeGreeting } from '@/lib/hud/greeting';
import {
  detectLanguageSwitch,
  detectPageSwitch,
  isShareCommand,
  languageSwitchedReply,
  pageSwitchedReply,
  type HudPage,
} from '@/lib/hud/hudCommands';
import { useLiveVoice } from '@/hooks/useLiveVoice';
import { createWakeWordEngine, type WakeWordEngine } from '@/lib/voice/wakeWordEngine';
import { useNeuralVoice } from '@/hooks/useNeuralVoice';
import { useChargeReminder } from '@/hooks/useChargeReminder';
import { errorMessage, humanizeError } from '@/lib/utils/errors';
import { recordLive } from '@/lib/telemetry/liveLog';
import { liveText } from '@/lib/telemetry/transcriptPolicy';
import { getLiveStatus, isLiveActive, stopLiveLink, subscribeLiveStatus } from '@/lib/telemetry/liveSession';
import { StageTimer, formatLatencyReport, recordTurn, type Scenario } from '@/lib/telemetry/stageTimer';
import { VoiceSessionController } from '@/lib/voice/voiceSession';
import { useConnectivity } from '@/hooks/useConnectivity';
import type { QrMatrix } from '@/lib/tools/localExtras';
import type { QuranPassage } from '@/lib/tools/freeApis';

/** Monotonic clock for stage marks, matching StageTimer's own. */
const monotonic = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/** Which latency bucket a turn belongs to, from the route it took. */
function scenarioFor(tool: string | undefined, local: boolean): Scenario {
  if (!tool) return local ? 'conversation' : 'cloud';
  return tool.startsWith('live.') ? 'live-data-network' : 'local-command';
}

/** What a tool handed back besides its sentence, for the menu sheet. */
interface ToolExtras {
  qr?: QrMatrix;
  passage?: QuranPassage;
  links?: { title: string; url: string }[];
  source?: string;
  stale?: boolean;
}
function extrasFrom(data: unknown): ToolExtras {
  if (!data || typeof data !== 'object') return {};
  const value = data as Record<string, unknown>;
  return {
    qr: value.qr && typeof value.qr === 'object' ? (value.qr as QrMatrix) : undefined,
    passage: value.passage && typeof value.passage === 'object' ? (value.passage as QuranPassage) : undefined,
    links: Array.isArray(value.links) ? (value.links as { title: string; url: string }[]) : undefined,
    source: typeof value.source === 'string' ? value.source : undefined,
    stale: value.stale === true,
  };
}

/** How long a weather/prayer answer stays the context for "and tomorrow?". */
const FOLLOW_UP_LIVE_MS = 120_000;

/** How long after JARVIS finishes speaking a reply is heard without the wake word. */
const FOLLOW_UP_MS = 8_000;

/**
 * The ambient HUD — JARVIS's only screen.
 *
 * This replaces the eight-tab workspace grid. The hands-free wake-word loop,
 * the self-listening suppression and the voice session lifecycle are the ones
 * built for the hands-free branch; only the presentation changed. Runtime
 * facts (model, acceleration, measured throughput) stay on screen because the
 * owner can no longer reach a Runtime tab to check them.
 */
export default function JarvisHud() {
  const jarvis = useJarvis();
  // The HUD has no mode switcher of its own: it follows the owner's default
  // mode live, so changing it in Settings or Chat takes effect here at once.
  const mode: IntelligenceMode = jarvis.settings.defaultMode;
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [toolRunning, setToolRunning] = useState(false);
  const [watching, setWatching] = useState(false);
  // The orb page, or the live camera page with JARVIS in the corner.
  const [page, setPage] = useState<HudPage>('orb');
  const greetedRef = useRef(false);
  // Set when an answer has been spoken in hands-free mode: once the voice
  // finishes, the owner can reply for a few seconds without the wake word.
  const followUpRef = useRef(false);
  const [speaking, setSpeaking] = useState(false);
  // null = not downloading; 0..1 = measured download progress.
  const [brainBusy, setBrainBusy] = useState(false);
  // Which brain produced the last answer — shown so the owner always knows
  // whether a reply stayed on the phone.
  const [answerSource, setAnswerSource] = useState<AnswerSource>();
  const awakeUntilRef = useRef(0);
  // The "hey jarvis" engine, when the owner turned it on and it could start.
  const [wakeEngine, setWakeEngine] = useState<WakeWordEngine | null>(null);
  const autoStartAttemptedRef = useRef(false);
  const speakingRef = useRef(false);
  const historyRef = useRef<CompletionMessage[]>([]);
  // Incremented on every halt and every new command, so segments belonging to
  // an abandoned answer can never reach the speaker after the owner moved on.
  const speechEpochRef = useRef(0);
  // System-voice segments still queued for the current answer. JARVIS is only
  // "done speaking" when this reaches zero: releasing on the first segment to
  // finish reopened the microphone while later sentences were still playing,
  // so JARVIS could transcribe its own voice.
  const pendingSystemSegmentsRef = useRef(0);
  // The one owner of turns: IDs, cancellation, late-result rejection.
  const sessionRef = useRef<VoiceSessionController | null>(null);
  if (!sessionRef.current) sessionRef.current = new VoiceSessionController();
  const session = sessionRef.current;
  const busyRef = useRef(false);
  // Stage timings for the turn in flight; the voice's first sound closes it.
  const timerRef = useRef<StageTimer | null>(null);
  const speechEndRef = useRef<number | null>(null);
  const lastSpeechEndRef = useRef<number | null>(null);
  const lastLiveRef = useRef<(LiveContext & { at: number }) | null>(null);
  const [sheet, setSheet] = useState<'none' | 'menu' | 'history'>('none');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [extras, setExtras] = useState<ToolExtras>({});
  const [burst, setBurst] = useState(0);
  const [interruptedTick, setInterruptedTick] = useState(0);
  const connectivity = useConnectivity();
  const { width, height } = useWindowDimensions();
  const coreSize = Math.round(Math.min(width, height) * 0.82);

  useEffect(() => session.setConnectivity(connectivity), [connectivity, session]);

  /** The first audible moment of the current turn's answer. */
  function markFirstAudio() {
    timerRef.current?.mark('firstAudio');
  }

  // The on-device neural voice (Kokoro). English only; when it is not ready,
  // not enabled, or the language is Arabic, the phone's own voice speaks.
  const neural = useNeuralVoice({
    enabled: jarvis.settings.neuralVoiceEnabled,
    language: jarvis.settings.language,
    onSpeakingChange: (speaking) => {
      speakingRef.current = speaking;
      setSpeaking(speaking);
      if (speaking) markFirstAudio();
    },
  });

  useChargeReminder({
    enabled: jarvis.settings.chargeReminderEnabled,
    threshold: jarvis.settings.chargeReminderLevel,
    language: jarvis.settings.language === 'ar' ? 'ar' : 'en',
    speak: (text) => speakJarvis(text),
  });

  /** The owner's words as the live log may carry them: word counts unless opted in. */
  function said(text: string): string {
    return liveText(text, jarvis.settings.liveTranscriptsUntil, Date.now());
  }

  function speakJarvis(text: string, secret = false, language = jarvis.settings.language) {
    recordLive('speak', secret ? '[private phone data]' : said(text), { engine: neural.isReady ? 'neural' : 'system' });
    // Kokoro is English-only; anything else uses the phone's own voice for that language.
    if (neural.isReady && language === 'en') {
      neural.speakAll(text);
      return;
    }
    speakingRef.current = true;
    setSpeaking(true);
    const release = () => {
      speakingRef.current = false;
      setSpeaking(false);
    };
    const failed = (error?: unknown) => {
      recordLive('error', 'system voice failed', { error: error === undefined ? null : errorMessage(error) });
      release();
    };
    void speakResponse(text, language, {
      onStart: markFirstAudio,
      onDone: release,
      onError: failed,
    }).catch(failed);
  }

  async function runCommand(commandText: string) {
    const command = commandText.trim();
    if (!command) return;

    if (isHaltCommand(command)) {
      haltEverything();
      setInput('');
      return;
    }

    // A new accepted turn replaces the one in flight: its generation, tools
    // and queued speech are cancelled before this one starts.
    if (busyRef.current) {
      session.cancel('superseded');
      // The Core shows it: a warp and a brief contraction, then the new turn.
      setInterruptedTick((n) => n + 1);
      recordLive('halt', 'superseded by a new command');
      speechEpochRef.current += 1;
      pendingSystemSegmentsRef.current = 0;
      neural.stop();
      void stopSpeaking();
      await jarvis.stopGeneration().catch(() => undefined);
    }

    const voiceReply = jarvis.settings.autoSpeak || jarvis.settings.handsFreeEnabled;

    // App-level commands: they change JARVIS itself, so they never reach a brain.
    const switchTo = detectLanguageSwitch(command);
    if (switchTo) {
      await jarvis.updateSettings({ language: switchTo });
      const reply = languageSwitchedReply(switchTo);
      recordLive('app', 'language switched', { to: switchTo });
      setResponse(reply);
      setInput('');
      if (voiceReply) speakJarvis(reply, false, switchTo);
      return;
    }
    const pageTo = detectPageSwitch(command);
    if (pageTo) {
      showPage(pageTo);
      const reply = pageSwitchedReply(pageTo, arabic ? 'ar' : 'en');
      setResponse(reply);
      setInput('');
      if (voiceReply) speakJarvis(reply);
      return;
    }
    if (isShareCommand(command)) {
      setInput('');
      if (!response.trim()) {
        const nothing = arabic ? 'لا يوجد رد لمشاركته بعد.' : "There's no answer to share yet.";
        setResponse(nothing);
        if (voiceReply) speakJarvis(nothing);
        return;
      }
      recordLive('app', 'share sheet opened');
      // The owner picks the app in Android's share sheet; nothing is sent by itself.
      await Share.share({ message: response });
      return;
    }

    // The deterministic router is the same function `ask` consults first, so
    // this reports the path the request will actually take rather than a guess.
    // A short follow-up ("and tomorrow?", "what about Dubai?") right after a
    // weather or prayer answer becomes the full command, so it stays on the tool.
    const lastLive = lastLiveRef.current && Date.now() - lastLiveRef.current.at < FOLLOW_UP_LIVE_MS ? lastLiveRef.current : null;
    const asked = followUpCommand(command, lastLive) ?? command;
    const route = routeDeterministicTool(asked);
    const deterministic = Boolean(route);
    if (route && (route.call.tool === 'live.weather' || route.call.tool === 'live.prayer')) {
      const city = typeof route.call.arguments.city === 'string' ? route.call.arguments.city : lastLive?.city;
      lastLiveRef.current = { tool: route.call.tool, city, at: Date.now() };
    }
    // Tools share a short deadline (4 s requests, one retry); a spoken answer
    // from the phone's brain can legitimately take minutes, so it gets room.
    const turn = session.beginTurn(route ? 15_000 : 300_000);
    const timer = new StageTimer();
    timerRef.current = timer;
    if (speechEndRef.current !== null) timer.mark('speechEnd', speechEndRef.current);
    speechEndRef.current = null;
    timer.mark('dispatch');
    timer.language = jarvis.settings.language === 'ar' ? 'ar' : 'en';
    timer.scenario = scenarioFor(route?.call.tool, jarvis.modelState.status === 'ready');
    if (route) timer.mark('toolStart');
    else timer.mark('modelStart');
    const looking = route?.call.tool === 'vision.look';
    const askedAt = Date.now();
    let firstTokenAt = 0;
    let firstSpeechAt = 0;
    const voiceOut = jarvis.settings.autoSpeak || jarvis.settings.handsFreeEnabled;
    // A spoken question gets the fast profile: short, low-temperature, and the
    // quickest to its first word. Deeper modes stay for typed work.
    const turnMode: IntelligenceMode = voiceOut ? 'fast' : mode;
    recordLive('ask', said(command), {
      route: deterministic ? 'tool' : jarvis.modelState.status === 'ready' ? 'local' : jarvis.cloudReady ? 'cloud' : 'none',
      mode: turnMode,
    });

    busyRef.current = true;
    setBusy(true);
    setToolRunning(deterministic);
    setExtras({});
    // The camera is only ever open inside this turn, and the HUD says so for all of it.
    setWatching(looking);
    if (looking) recordLive('app', 'camera on', { by: 'owner request' });
    setInput(command);
    // Every command is its own turn: what was heard before must not linger.
    voice.clearTranscript();
    setResponse('');
    setAnswerSource(undefined);

    const epoch = (speechEpochRef.current += 1);
    // A new answer replaces whatever is still being said, rather than queueing
    // behind it. Resetting the counter matters as much: segments from the old
    // epoch return early without decrementing, so a stale count would never
    // reach zero and JARVIS would stay "speaking" — microphone muted — forever.
    pendingSystemSegmentsRef.current = 0;
    neural.stop();
    void stopSpeaking();
    // Speak each sentence the moment it is complete, rather than waiting for
    // the whole answer. A tool route returns one short string with nothing to
    // stream, so it keeps the simple path.
    const stream = voiceOut && !deterministic ? new SpeechStream() : null;

    // `filler` marks the one "let me think" line: it must not count as the
    // answer's first word in the latency figures.
    const say = (segments: string[], filler = false) => {
      if (!stream || segments.length === 0 || speechEpochRef.current !== epoch) return;
      if (!session.isCurrent(turn.turnId) && !filler) return;
      if (!filler && !firstSpeechAt) firstSpeechAt = Date.now();
      if (!filler) timer.mark('ttsQueued');
      if (neural.isReady) {
        // Speaking state is reported by the neural queue itself.
        for (const segment of segments) neural.enqueue(segment);
        return;
      }
      speakingRef.current = true;
      setSpeaking(true);
      pendingSystemSegmentsRef.current += segments.length;
      for (const segment of segments) {
        void speakQueued(segment, jarvis.settings.language, { onStart: filler ? undefined : markFirstAudio }).then(() => {
          // A newer answer, or a halt, has already taken over the speaker.
          if (speechEpochRef.current !== epoch) return;
          pendingSystemSegmentsRef.current -= 1;
          if (pendingSystemSegmentsRef.current > 0) return;
          pendingSystemSegmentsRef.current = 0;
          speakingRef.current = false;
          setSpeaking(false);
        });
      }
    };

    // If the brain is still silent after a moment, say so rather than leave
    // the owner in silence. Once per question; never over the answer itself.
    let fillerAt = 0;
    const fillerTimer = stream
      ? setTimeout(() => {
          if (firstSpeechAt || speechEpochRef.current !== epoch) return;
          fillerAt = Date.now();
          say([thinkingFiller(jarvis.settings.language, epoch)], true);
        }, FILLER_AFTER_MS)
      : undefined;

    try {
      const result = await jarvis.ask(
        asked,
        turnMode,
        (token) => {
          // Tokens from a turn the owner has already moved on from are dropped.
          if (!session.isCurrent(turn.turnId)) return;
          if (!firstTokenAt) {
            firstTokenAt = Date.now();
            timer.mark('firstToken');
          }
          setResponse((current) => current + token);
          if (stream) say(stream.push(token));
        },
        historyRef.current,
        // When the answer is going to be read aloud, it has to be written to
        // be heard: short spoken sentences, no markdown for the synthesiser to
        // stumble over. A neural voice reading a bulleted essay still sounds
        // like a machine.
        { spoken: voiceOut, turn: { signal: turn.signal, deadlineAt: turn.deadlineAt } },
      );
      // A late answer from a cancelled or superseded turn is discarded, never spoken.
      if (!session.isCurrent(turn.turnId)) {
        recordLive('app', 'late result discarded', { route: route?.call.tool ?? 'brain' });
        return;
      }
      if (route) timer.mark('toolEnd');
      else timer.mark('modelEnd');
      const extra = extrasFrom(result.toolData);
      if (extra.stale) timer.scenario = 'live-data-cached';
      else if (route?.call.tool.startsWith('live.') && extra.source && result.toolData && (result.toolData as { fetchedAt?: number }).fetchedAt !== undefined) {
        const fetchedAt = (result.toolData as { fetchedAt: number }).fetchedAt;
        if (Date.now() - fetchedAt > 5_000) timer.scenario = 'live-data-cached';
      }
      setExtras(extra);
      // A QR code is an answer to look at: show it.
      if (extra.qr) setSheet('menu');
      setResponse(result.text);
      setAnswerSource(result.source);
      setHistory((items) =>
        [
          ...items,
          {
            id: turn.turnId,
            question: result.private ? (arabic ? '[طلب خاص]' : '[private request]') : command,
            answer: result.private ? (arabic ? '[بيانات خاصة من الهاتف]' : '[private phone data]') : result.text,
            source: extra.source ?? describeSource(result.source, arabic),
            at: Date.now(),
            stale: extra.stale,
          },
        ].slice(-50),
      );
      // Messages, calls, contacts and calendar never reach the live log
      // (a public repository) or the conversation history sent to a brain.
      recordLive('answer', result.private ? '[private phone data]' : said(result.text), {
        // Checkable without the words: did any reasoning reach the owner?
        thinkLeak: /<\/?think/i.test(result.text),
        source: result.source,
        ms: Date.now() - askedAt,
        firstTokenMs: firstTokenAt ? firstTokenAt - askedAt : null,
        // When the first sentence was handed to the voice — the owner's
        // "time to first word". Null for whole-answer (tool) speech.
        firstSpeechMs: firstSpeechAt ? firstSpeechAt - askedAt : null,
        fillerMs: fillerAt ? fillerAt - askedAt : null,
        chars: result.text.length,
        voice: stream ? 'streamed' : voiceOut ? 'whole' : 'off',
      });
      if (!result.private) historyRef.current = appendExchange(historyRef.current, command, result.text);
      if (jarvis.settings.handsFreeEnabled && voiceOut) followUpRef.current = true;

      // A tool the local brain chose returns its sentence whole, with no
      // tokens streamed — speak it whole rather than flushing an empty stream.
      if (stream && firstTokenAt) {
        say(stream.flush());
      } else if (voiceOut) {
        speakJarvis(result.text, result.private);
      }
    } catch (error) {
      if (!session.isCurrent(turn.turnId)) return;
      const message = humanizeError(errorMessage(error));
      recordLive('error', message, { raw: errorMessage(error), ms: Date.now() - askedAt });
      setResponse(message);
      if (jarvis.settings.handsFreeEnabled) {
        speakJarvis(message);
      } else {
        Alert.alert('JARVIS error', message);
      }
    } finally {
      clearTimeout(fillerTimer);
      // Clear the typed command whatever happened: old words must not linger.
      setInput('');
      if (!voiceOut) {
        timer.mark('turnEnd');
        recordTurn(timer);
      }
      // Only the live turn (or no turn at all) may reset the shared state; a
      // superseded turn finishing late must not unset the new one's "busy".
      const current = session.snapshot().turnId;
      if (current === turn.turnId || current === null) {
        // Speaking is tracked by the voice itself (setSpeaking), not assumed here.
        session.endTurn(turn.turnId, 'idle');
        busyRef.current = false;
        setBusy(false);
        setToolRunning(false);
      }
      if (looking) {
        setWatching(false);
        recordLive('app', 'camera off');
      }
    }
  }

  function showPage(next: HudPage) {
    if (next === page) return;
    recordLive('app', next === 'camera' ? 'camera page on' : 'camera page off');
    setPage(next);
  }

  /** Stop speech and generation now. No model call, no confirmation. */
  function haltEverything() {
    recordLive('halt', 'stopped speech and generation');
    session.cancel('user');
    busyRef.current = false;
    setInterruptedTick((n) => n + 1);
    speakingRef.current = false;
    setSpeaking(false);
    awakeUntilRef.current = 0;
    // Retire the current answer's speech epoch first: segments already queued
    // resolve into a stale epoch and are dropped instead of resuming after the
    // engine's queue is cleared.
    speechEpochRef.current += 1;
    pendingSystemSegmentsRef.current = 0;
    neural.stop();
    void stopSpeaking();
    void jarvis.stopGeneration().catch(() => undefined);
    setResponse(haltAcknowledgement(jarvis.settings.language));
  }

  function handleVoiceFinal(text: string) {
    const clean = text.trim();
    if (!clean) return;
    // End of speech as measured on the audio by the endpointer, when it saw
    // this utterance end in the last few seconds; otherwise the recogniser's
    // final, the closest observable point.
    const measured = lastSpeechEndRef.current;
    speechEndRef.current = measured !== null && monotonic() - measured < 5_000 ? measured : monotonic();
    lastSpeechEndRef.current = null;
    recordLive('heard', said(clean), {
      speaking: speakingRef.current,
      awake: awakeUntilRef.current > Date.now(),
    });

    // While JARVIS is speaking the recorder's frames are deliberately dropped
    // so it cannot transcribe itself, so a spoken halt cannot be heard then —
    // tapping the orb is the barge-in for that case. A halt spoken while it is
    // *generating* does reach us, and stops the run before it is read out.
    if (isHaltCommand(clean)) {
      haltEverything();
      return;
    }

    // Half-duplex on this build (no verified echo cancellation): speech heard
    // while JARVIS talks is ignored, and a tap on the Core is the barge-in.
    // The rule lives in bargeInDecision so it can only be widened honestly.
    if (bargeInDecision({ speaking: speakingRef.current, echoSafe: ECHO_SAFE, transcript: clean }) === 'ignore') return;

    if (!jarvis.settings.handsFreeEnabled) {
      setInput((current) => `${current} ${clean}`.trim());
      return;
    }

    const wake = extractWakeCommand(clean, jarvis.settings.wakeWord);
    if (wake.heard) recordLive('wake', wake.command ? 'wake word + command' : 'wake word only', { command: wake.command ? said(wake.command) : null });
    else if (awakeUntilRef.current <= Date.now()) recordLive('wake', 'ignored: no wake word', { wakeWord: jarvis.settings.wakeWord });
    if (wake.heard) {
      setBurst((n) => n + 1);
      if (wake.command) {
        awakeUntilRef.current = 0;
        void runCommand(wake.command);
      } else {
        awakeUntilRef.current = Date.now() + 10_000;
        speakJarvis(
          wakeGreeting({
            firstOfSession: !greetedRef.current,
            hour: new Date().getHours(),
            lang: jarvis.settings.language === 'ar' ? 'ar' : 'en',
            project: jarvis.activeProject
              ? { name: jarvis.activeProject.name, nextAction: jarvis.activeProject.nextAction ?? undefined }
              : undefined,
          }),
        );
        greetedRef.current = true;
      }
      return;
    }

    if (awakeUntilRef.current > Date.now()) {
      awakeUntilRef.current = 0;
      void runCommand(clean);
    }
  }

  const voice = useLiveVoice({
    language: jarvis.settings.language,
    onFinal: handleVoiceFinal,
    onSpeechEnd: (msAgo) => {
      lastSpeechEndRef.current = monotonic() - msAgo;
    },
    shouldAcceptAudio: () => !speakingRef.current,
    wakeGate: wakeEngine
      ? {
          engine: wakeEngine,
          isAwake: () => awakeUntilRef.current > Date.now(),
          onWake: () => {
            // No spoken greeting here: JARVIS's own voice would mute the
            // microphone and swallow the command that follows the wake word.
            awakeUntilRef.current = Date.now() + 10_000;
            setBurst((n) => n + 1);
            recordLive('wake', 'wake word (openWakeWord)');
          },
        }
      : undefined,
  });

  // Start the wake-word engine when asked for; any failure leaves the
  // speech-based wake word in charge.
  useEffect(() => {
    if (!jarvis.settings.wakeEngineEnabled || !jarvis.settings.handsFreeEnabled) {
      setWakeEngine(null);
      return;
    }
    let cancelled = false;
    void createWakeWordEngine().then((engine) => {
      if (cancelled) return;
      setWakeEngine(engine);
      recordLive('wake', engine ? 'wake engine ready' : 'wake engine unavailable — using speech');
    });
    return () => {
      cancelled = true;
    };
  }, [jarvis.settings.wakeEngineEnabled, jarvis.settings.handsFreeEnabled]);
  const { isReady: voiceReady, state: voiceState, start: startVoice } = voice;

  useEffect(() => {
    if (!jarvis.settings.handsFreeEnabled) {
      autoStartAttemptedRef.current = false;
      return;
    }
    if (!voiceReady || autoStartAttemptedRef.current) return;
    if (voiceState !== 'IDLE' && voiceState !== 'ERROR') return;

    autoStartAttemptedRef.current = true;
    void startVoice();
  }, [jarvis.settings.handsFreeEnabled, voiceReady, voiceState, startVoice]);

  const hud = useMemo(
    () =>
      describeHud({
        modelStatus: jarvis.modelState.status,
        voiceState: voice.state,
        generating: busy && !toolRunning,
        speaking,
        toolRunning,
        handsFree: jarvis.settings.handsFreeEnabled,
        wakeWord: jarvis.settings.wakeWord,
        sttReady: voice.isReady,
        sttProgress: voice.downloadProgress,
        language: jarvis.settings.language,
        cloudReady: jarvis.cloudReady,
        watching,
      }),
    [
      jarvis.cloudReady,
      watching,
      busy,
      jarvis.modelState.status,
      jarvis.settings.handsFreeEnabled,
      jarvis.settings.language,
      jarvis.settings.wakeWord,
      speaking,
      toolRunning,
      voice.downloadProgress,
      voice.isReady,
      voice.state,
    ],
  );

  // Live test log: state changes as they happen, so a test can be followed
  // off the phone. Recording is in-memory; see lib/telemetry/liveLog.ts.
  useEffect(() => {
    recordLive('app', 'HUD opened', {
      lang: jarvis.settings.language,
      handsFree: jarvis.settings.handsFreeEnabled,
      neuralVoice: jarvis.settings.neuralVoiceEnabled,
      cloudFallback: jarvis.settings.cloudFallbackEnabled,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    recordLive('state', hud.state, { headline: hud.headline });
  }, [hud.state, hud.headline]);
  useEffect(() => {
    recordLive('brain', jarvis.modelState.status, {
      model: jarvis.modelState.modelName ?? null,
      gpu: jarvis.modelState.gpu ?? null,
      error: jarvis.modelState.error ?? null,
    });
  }, [jarvis.modelState.status, jarvis.modelState.modelName, jarvis.modelState.gpu, jarvis.modelState.error]);
  useEffect(() => {
    recordLive('voice', voice.state, { sttReady: voice.isReady, neuralReady: neural.isReady });
  }, [voice.state, voice.isReady, neural.isReady]);
  useEffect(() => {
    if (voice.error) recordLive('error', voice.error, { where: 'microphone' });
  }, [voice.error]);
  useEffect(() => {
    recordLive('speak', speaking ? 'speaking' : 'silent');
    session.setSpeaking(speaking);
    const timer = timerRef.current;
    if (!speaking && timer?.has('firstAudio') && !timer.has('turnEnd')) {
      timer.mark('turnEnd');
      recordTurn(timer);
      recordLive('latency', timer.scenario, timer.summary());
    }
    if (!speaking && followUpRef.current) {
      followUpRef.current = false;
      awakeUntilRef.current = Date.now() + FOLLOW_UP_MS;
      recordLive('wake', 'follow-up window open', { ms: FOLLOW_UP_MS });
    }
  }, [speaking, session]);
  const liveStatus = useSyncExternalStore(subscribeLiveStatus, getLiveStatus, getLiveStatus);
  const live = isLiveActive(liveStatus);

  /**
   * The one action that turns a listening-but-mute JARVIS into a working one.
   * The context decides what that means: load the brain already on the phone
   * (a retry after a failed load), attach to Android's running download, or
   * start one. It never deletes a model that is already here.
   */
  async function installBrain() {
    if (brainBusy || jarvis.brainDownload) return;
    setBrainBusy(true);
    try {
      await jarvis.installRecommendedModel();
      const ready = arabic ? 'العقل جاهز. أنا معك.' : 'Brain loaded. I am ready.';
      setResponse(ready);
      if (jarvis.settings.autoSpeak || jarvis.settings.handsFreeEnabled) speakJarvis(ready);
    } catch (error) {
      recordLive('error', 'brain install failed', { raw: errorMessage(error) });
      Alert.alert(arabic ? 'تعذّر تحميل العقل' : 'Could not load the brain', humanizeError(errorMessage(error)));
    } finally {
      setBrainBusy(false);
    }
  }

  function toggleVoice() {
    // Tapping the orb while JARVIS is talking or generating means "stop", not
    // "end my microphone session". It is the fastest gesture on the screen and
    // it must map to the thing the owner most urgently wants.
    if (speaking || busy) {
      haltEverything();
      return;
    }

    if (orbTapStartsVoice(voice.state)) {
      if (!voice.isReady) return;
      void voice.start();
      return;
    }
    void voice.stop();
  }

  const arabic = jarvis.settings.language === 'ar';
  const downloading = jarvis.brainDownload !== null;
  const downloadPercent =
    jarvis.brainDownload?.progress == null ? null : Math.round(jarvis.brainDownload.progress * 100);
  const micOn = !speaking && (voice.state === 'LISTENING' || voice.state === 'TRANSCRIBING');

  // Edge swipe → history. The strip sits on the trailing edge for the
  // language (right in English, left in Arabic) and ignores vertical drags.
  const edgePan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, g) => Math.abs(g.dx) > 12 && Math.abs(g.dy) < 30,
        onPanResponderRelease: (_event, g) => {
          if ((arabic ? g.dx : -g.dx) > 40) setSheet('history');
        },
      }),
    [arabic],
  );

  const settingsNeedAttention = hud.needsBrain || (!jarvis.permanentStorage && Platform.OS === 'android');

  const storageBanner =
    !jarvis.permanentStorage && Platform.OS === 'android' ? (
      <Pressable
        onPress={jarvis.requestPermanentStorage}
        accessibilityRole="button"
        style={({ pressed }) => [styles.brainButton, pressed && styles.brainPressed]}
      >
        <Text style={styles.brainTitle}>{arabic ? 'احفظ كل شيء في الهاتف' : 'Keep everything on this phone'}</Text>
        <Text style={styles.brainSub}>
          {arabic
            ? 'اسمح بـ «الوصول إلى كل الملفات» مرة واحدة، فيبقى العقل والصوت في مجلد Download/JARVIS حتى لو أُغلق التطبيق أو حُذف.'
            : 'Allow "All files access" once and the brain and voice stay in Download/JARVIS — even if the app is closed or reinstalled.'}
        </Text>
      </Pressable>
    ) : null;

  const brainBanner =
    hud.needsBrain && jarvis.modelState.status !== 'loading' ? (
      <Pressable
        onPress={() => void installBrain()}
        disabled={downloading || brainBusy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.brainButton, pressed && styles.brainPressed]}
      >
        <Text style={styles.brainTitle}>
          {downloading
            ? downloadPercent === null
              ? arabic ? 'جارٍ بدء التنزيل…' : 'Starting download…'
              : arabic ? `جارٍ التنزيل ${downloadPercent}%` : `Downloading ${downloadPercent}%`
            : brainBusy
              ? arabic ? 'جارٍ تحميل العقل…' : 'Loading the brain…'
              : jarvis.modelState.status === 'error' && jarvis.settings.modelPath
                ? arabic ? 'إعادة تحميل العقل' : 'Retry loading the brain'
                : arabic ? 'تنزيل عقل JARVIS' : 'Download JARVIS brain'}
        </Text>
        <Text style={styles.brainSub}>
          {downloading
            ? jarvis.brainDownload?.note ??
              (arabic
                ? 'يمكنك مغادرة التطبيق — أندرويد يكمل التنزيل. التقدّم في الإشعارات.'
                : 'You can leave the app — Android keeps downloading. Progress is in your notifications.')
            : jarvis.modelState.status === 'error' && jarvis.modelState.error
              ? jarvis.modelState.error
              : arabic ? 'Qwen3 8B · 5 جيجابايت · مرة واحدة · يعمل دون إنترنت' : 'Qwen3 8B · 5 GB · downloaded once · runs offline'}
        </Text>
        {downloading ? (
          <View style={styles.brainTrack}>
            <View style={[styles.brainFill, { width: `${Math.max(2, downloadPercent ?? 0)}%` }]} />
          </View>
        ) : null}
      </Pressable>
    ) : null;

  return (
    <SafeAreaView style={styles.screen}>
      {/* The main layer: the Core and nothing else. */}
      {page === 'camera' ? (
        <CameraPage state={hud.state} level={voice.level} onOrbPress={toggleVoice} arabic={arabic} />
      ) : (
        <View style={styles.stage}>
          <JarvisOrb
            state={hud.state}
            level={voice.level}
            onPress={toggleVoice}
            onLongPress={() => setSheet('menu')}
            onHistory={() => setSheet('history')}
            label={hud.headline}
            size={coreSize}
            burst={burst}
            interrupted={interruptedTick}
            offline={connectivity !== 'online'}
            showLabel={jarvis.settings.coreLabels}
            speaking={speaking}
            transcribing={voice.state === 'TRANSCRIBING'}
            throttled={(jarvis.powerReading?.state.thermalStatus ?? 0) >= 2}
          />
          {jarvis.settings.coreLabels ? (
            <Row>
              <Button title={arabic ? 'القائمة' : 'Menu'} onPress={() => setSheet('menu')} />
              <Button title={arabic ? 'السجل' : 'History'} onPress={() => setSheet('history')} />
            </Row>
          ) : null}
        </View>
      )}

      {/* Privacy indicator, not decoration: the live test link is streaming. */}
      {live ? (
        <Pressable
          onPress={() => void stopLiveLink()}
          accessibilityRole="button"
          accessibilityLabel="Live test link is on. Tap to stop it."
          hitSlop={16}
          style={styles.liveDot}
        />
      ) : null}

      <View style={[styles.edge, arabic ? styles.edgeStart : styles.edgeEnd]} {...edgePan.panHandlers} />

      {!jarvis.settings.coreHintSeen ? (
        <FirstRunCard rtl={arabic} onDismiss={() => void jarvis.updateSettings({ coreHintSeen: true })}>
          {settingsNeedAttention ? (
            <View style={styles.hintSetup}>
              {storageBanner}
              {brainBanner}
            </View>
          ) : null}
        </FirstRunCard>
      ) : null}

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet('none')} title="JARVIS" rtl={arabic}>
        <DashboardClock
          lang={arabic ? 'ar' : 'en'}
          status={{
            modelStatus: jarvis.modelState.status,
            modelName: jarvis.modelState.modelName ?? jarvis.settings.modelName,
            cloudReady: jarvis.cloudReady,
            micOn,
            camera: watching,
          }}
        />
        <Text style={styles.detail}>
          {hud.detail}
          {connectivity !== 'online' ? (arabic ? ' · بدون إنترنت' : ' · offline') : ''}
        </Text>
        {voice.transcript ? (
          <Text style={styles.transcript} numberOfLines={2}>
            “{voice.transcript}”
          </Text>
        ) : null}
        {voice.error ? <Text style={styles.problem}>{voice.error}</Text> : null}
        {storageBanner}
        {brainBanner}

        {response ? (
          <View style={styles.responseBlock}>
            <Text style={styles.responseText} selectable>
              {response}
            </Text>
            {extras.qr ? <QrView qr={extras.qr} /> : null}
            {extras.passage ? (
              <View style={styles.passage}>
                <Text style={styles.arabicVerse} selectable>
                  {extras.passage.arabic}
                </Text>
                <Text style={styles.responseText} selectable>
                  {extras.passage.english}
                </Text>
                <Text style={styles.sourceLabel}>
                  {extras.passage.surahName} {extras.passage.reference} · {extras.passage.editions.arabic}, {extras.passage.editions.english}
                </Text>
              </View>
            ) : null}
            {extras.links?.slice(0, 5).map((link) => (
              <Text key={link.url} style={styles.link} selectable>
                {link.title}
              </Text>
            ))}
            {answerSource ? (
              <Text style={styles.sourceLabel}>
                {extras.source ?? describeSource(answerSource, arabic)}
                {extras.stale ? (arabic ? ' · نسخة محفوظة' : ' · cached copy') : ''}
              </Text>
            ) : null}
            <Row>
              <Button title={arabic ? 'انطق' : 'Speak'} onPress={() => speakJarvis(response)} />
              <Button
                title={arabic ? 'احفظ في الذاكرة' : 'Save memory'}
                onPress={() => void jarvis.saveMemory('Saved JARVIS insight', response)}
              />
            </Row>
          </View>
        ) : null}

        {jarvis.activeProject ? (
          <Pressable onPress={() => setInput(jarvis.activeProject?.nextAction ?? '')} style={styles.projectPill}>
            <Text style={styles.projectPillText} numberOfLines={1}>
              {jarvis.activeProject.name}
              {jarvis.activeProject.nextAction ? ` · ${jarvis.activeProject.nextAction}` : ''}
            </Text>
          </Pressable>
        ) : null}

        <Field
          value={input}
          onChangeText={setInput}
          placeholder={arabic ? `قل «${jarvis.settings.wakeWord}» أو اكتب أمرًا…` : `Say “${jarvis.settings.wakeWord}”, or type a command…`}
        />
        <Row>
          <Button
            title={busy ? (arabic ? 'يعمل…' : 'Working…') : arabic ? 'إرسال' : 'Send'}
            onPress={() => void runCommand(input)}
            disabled={!input.trim()}
          />
          <Button
            title={arabic ? 'انظر' : 'Look'}
            onPress={() => void runCommand(arabic ? 'ماذا ترى' : 'what do you see')}
            disabled={busy}
          />
          {busy || speaking ? (
            <Button title={arabic ? 'إيقاف' : 'Stop'} onPress={haltEverything} />
          ) : (
            <Button
              title={orbTapStartsVoice(voice.state) ? (arabic ? 'صوت' : 'Voice') : arabic ? 'إيقاف الصوت' : 'Stop voice'}
              disabled={orbTapStartsVoice(voice.state) && !voice.isReady}
              onPress={toggleVoice}
            />
          )}
        </Row>
        <Row>
          <Button
            title={page === 'camera' ? (arabic ? 'إخفاء الكاميرا' : 'Hide camera') : arabic ? 'الكاميرا المباشرة' : 'Live camera'}
            onPress={() => {
              showPage(page === 'camera' ? 'orb' : 'camera');
              setSheet('none');
            }}
          />
          <Button title={arabic ? 'السجل' : 'History'} onPress={() => setSheet('history')} />
          {live ? <Button title={arabic ? 'إيقاف الرابط المباشر' : 'Stop live link'} onPress={() => void stopLiveLink()} /> : null}
        </Row>

        <HudDrawer language={jarvis.settings.language}>
          <Text style={styles.metrics}>{formatPerformance(jarvis.lastMetrics)}</Text>
          <Text style={styles.metrics}>{formatLatencyReport()}</Text>
        </HudDrawer>
      </Sheet>

      <Sheet visible={sheet === 'history'} onClose={() => setSheet('none')} title={arabic ? 'السجل' : 'History'} rtl={arabic}>
        <HistoryList items={history} rtl={arabic} onClear={() => setHistory([])} />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#030406' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  liveDot: { position: 'absolute', top: 44, left: 18, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bad },
  edge: { position: 'absolute', top: 80, bottom: 80, width: 24 },
  edgeEnd: { right: 0 },
  edgeStart: { left: 0 },
  hintSetup: { gap: 10, marginTop: 6 },
  responseBlock: { gap: 10, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 },
  passage: { gap: 8 },
  arabicVerse: { color: colors.text, fontSize: 20, lineHeight: 34, textAlign: 'right', writingDirection: 'rtl' },
  link: { color: colors.accent, fontSize: 13 },
  detail: { color: colors.text, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  transcript: { color: colors.muted, fontSize: 14, textAlign: 'center', fontStyle: 'italic' },
  problem: { color: colors.bad, fontSize: 12, textAlign: 'center' },
  projectPill: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel2,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    maxWidth: '100%',
  },
  projectPillText: { color: colors.muted, fontSize: 12 },
  responseText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  metrics: { color: colors.muted, fontSize: 11 },
  sourceLabel: { color: colors.muted, fontSize: 11, letterSpacing: 0.6 },
  brainButton: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: '#07212B',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 4,
    alignItems: 'center',
  },
  brainPressed: { opacity: 0.8 },
  brainTitle: { color: colors.accent, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  brainSub: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  brainTrack: { alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 8, overflow: 'hidden' },
  brainFill: { height: 4, backgroundColor: colors.accent },
});

function describeSource(source: AnswerSource, arabic: boolean): string {
  if (source === 'local') return arabic ? 'على الجهاز · لم يغادر الهاتف' : 'On-device · never left the phone';
  if (source === 'tool') return arabic ? 'أداة مدققة' : 'Audited tool';
  const provider = providerById(source.slice('cloud:'.length) as Parameters<typeof providerById>[0]);
  return arabic ? `عبر ${provider.name} · غادر الهاتف` : `Via ${provider.name} · left the phone`;
}
