import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, Row } from '@/components/Ui';
import { HudDrawer } from '@/components/HudDrawer';
import { JarvisOrb } from '@/components/JarvisOrb';
import { colors } from '@/components/theme';
import { useJarvis } from '@/context/JarvisContext';
import type { CompletionMessage, IntelligenceMode } from '@/lib/inference/types';
import { appendExchange } from '@/lib/hud/conversation';
import { describeHud, orbTapStartsVoice } from '@/lib/hud/hudState';
import { formatPerformance } from '@/lib/inference/performance';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';
import { haltAcknowledgement, isHaltCommand } from '@/lib/voice/bargeIn';
import { SpeechStream } from '@/lib/voice/speechStream';
import { speakQueued, speakResponse, stopSpeaking } from '@/lib/voice/voiceResponse';
import { extractWakeCommand } from '@/lib/voice/wakeWord';
import { useLiveVoice } from '@/hooks/useLiveVoice';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

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
  const [speaking, setSpeaking] = useState(false);
  // null = not downloading; 0..1 = measured download progress.
  const [brainProgress, setBrainProgress] = useState<number | null>(null);
  const awakeUntilRef = useRef(0);
  const autoStartAttemptedRef = useRef(false);
  const speakingRef = useRef(false);
  const historyRef = useRef<CompletionMessage[]>([]);
  // Incremented on every halt and every new command, so segments belonging to
  // an abandoned answer can never reach the speaker after the owner moved on.
  const speechEpochRef = useRef(0);

  function speakJarvis(text: string) {
    speakingRef.current = true;
    setSpeaking(true);
    const release = () => {
      speakingRef.current = false;
      setSpeaking(false);
    };
    void speakResponse(text, jarvis.settings.language, {
      onDone: release,
      onError: release,
    }).catch(release);
  }

  async function runCommand(commandText: string) {
    const command = commandText.trim();
    if (!command) return;

    if (isHaltCommand(command)) {
      haltEverything();
      setInput('');
      return;
    }

    if (busy) return;

    // The deterministic router is the same function `ask` consults first, so
    // this reports the path the request will actually take rather than a guess.
    const deterministic = Boolean(routeDeterministicTool(command));

    setBusy(true);
    setToolRunning(deterministic);
    setInput(command);
    setResponse('');

    const epoch = (speechEpochRef.current += 1);
    const voiceOut = jarvis.settings.autoSpeak || jarvis.settings.handsFreeEnabled;
    // Speak each sentence the moment it is complete, rather than waiting for
    // the whole answer. A tool route returns one short string with nothing to
    // stream, so it keeps the simple path.
    const stream = voiceOut && !deterministic ? new SpeechStream() : null;

    const say = (segments: string[]) => {
      if (!stream || segments.length === 0 || speechEpochRef.current !== epoch) return;
      speakingRef.current = true;
      setSpeaking(true);
      for (const segment of segments) {
        void speakQueued(segment, jarvis.settings.language).then(() => {
          // The last queued segment finishing is the end of JARVIS speaking —
          // unless a newer answer has already taken over the speaker.
          if (speechEpochRef.current !== epoch) return;
          speakingRef.current = false;
          setSpeaking(false);
        });
      }
    };

    try {
      const result = await jarvis.ask(
        command,
        mode,
        (token) => {
          setResponse((current) => current + token);
          if (stream) say(stream.push(token));
        },
        historyRef.current,
        // When the answer is going to be read aloud, it has to be written to
        // be heard: short spoken sentences, no markdown for the synthesiser to
        // stumble over. A neural voice reading a bulleted essay still sounds
        // like a machine.
        { spoken: voiceOut },
      );
      setResponse(result.text);
      historyRef.current = appendExchange(historyRef.current, command, result.text);

      if (stream) {
        say(stream.flush());
      } else if (voiceOut) {
        speakJarvis(result.text);
      }
    } catch (error) {
      const message = humanizeError(errorMessage(error));
      setResponse(message);
      if (jarvis.settings.handsFreeEnabled) {
        speakJarvis(message);
      } else {
        Alert.alert('JARVIS error', message);
      }
    } finally {
      setBusy(false);
      setToolRunning(false);
    }
  }

  /** Stop speech and generation now. No model call, no confirmation. */
  function haltEverything() {
    speakingRef.current = false;
    setSpeaking(false);
    awakeUntilRef.current = 0;
    // Retire the current answer's speech epoch first: segments already queued
    // resolve into a stale epoch and are dropped instead of resuming after the
    // engine's queue is cleared.
    speechEpochRef.current += 1;
    void stopSpeaking();
    void jarvis.stopGeneration().catch(() => undefined);
    setResponse(haltAcknowledgement(jarvis.settings.language));
  }

  function handleVoiceFinal(text: string) {
    const clean = text.trim();
    if (!clean) return;

    // While JARVIS is speaking the recorder's frames are deliberately dropped
    // so it cannot transcribe itself, so a spoken halt cannot be heard then —
    // tapping the orb is the barge-in for that case. A halt spoken while it is
    // *generating* does reach us, and stops the run before it is read out.
    if (isHaltCommand(clean)) {
      haltEverything();
      return;
    }

    if (speakingRef.current) return;

    if (!jarvis.settings.handsFreeEnabled) {
      setInput((current) => `${current} ${clean}`.trim());
      return;
    }

    const wake = extractWakeCommand(clean, jarvis.settings.wakeWord);
    if (wake.heard) {
      if (wake.command) {
        awakeUntilRef.current = 0;
        void runCommand(wake.command);
      } else {
        awakeUntilRef.current = Date.now() + 10_000;
        speakJarvis(jarvis.settings.language === 'ar' ? 'معاك.' : 'Yes?');
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
    shouldAcceptAudio: () => !speakingRef.current,
  });
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
      }),
    [
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

  /**
   * The one action that turns a listening-but-mute JARVIS into a working one.
   * When a model is configured but failed to load, retrying the load is the
   * right first move — re-downloading 2.5 GB would not fix an out-of-memory
   * failure and would waste the owner's data.
   */
  async function installBrain() {
    if (brainProgress !== null) return;
    const hasConfiguredModel = Boolean(jarvis.settings.modelPath && jarvis.settings.modelName);

    setBrainProgress(0);
    try {
      if (hasConfiguredModel && jarvis.modelState.status === 'error') {
        await jarvis.loadModel();
      } else {
        await jarvis.installRecommendedModel(setBrainProgress);
      }
      const ready = arabic ? 'العقل جاهز. أنا معك.' : 'Brain loaded. I am ready.';
      setResponse(ready);
      if (jarvis.settings.autoSpeak || jarvis.settings.handsFreeEnabled) speakJarvis(ready);
    } catch (error) {
      Alert.alert(arabic ? 'تعذّر تحميل العقل' : 'Could not load the brain', humanizeError(errorMessage(error)));
    } finally {
      setBrainProgress(null);
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
  const modelName = jarvis.modelState.modelName ?? jarvis.settings.modelName ?? (arabic ? 'لا يوجد نموذج' : 'No model');
  const acceleration = jarvis.modelState.gpu
    ? arabic ? 'تسريع نشط' : 'Accelerated backend active'
    : jarvis.modelState.reasonNoGPU ?? (arabic ? 'غير مُقاس' : 'Not measured');

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.statusBar}>
        <Text style={styles.wordmark}>JARVIS</Text>
        <Text style={styles.statusMeta} numberOfLines={1}>
          {modelName} · {acceleration}
        </Text>
      </View>

      <View style={styles.stage}>
        <JarvisOrb state={hud.state} level={voice.level} onPress={toggleVoice} label={hud.headline} />
        <Text style={styles.detail}>{hud.detail}</Text>
        {voice.transcript ? (
          <Text style={styles.transcript} numberOfLines={2}>
            “{voice.transcript}”
          </Text>
        ) : null}
        {voice.error ? <Text style={styles.problem}>{voice.error}</Text> : null}
        {hud.needsBrain && jarvis.modelState.status !== 'loading' ? (
          <Pressable
            onPress={() => void installBrain()}
            disabled={brainProgress !== null}
            accessibilityRole="button"
            style={({ pressed }) => [styles.brainButton, pressed && styles.brainPressed]}
          >
            <Text style={styles.brainTitle}>
              {brainProgress !== null
                ? arabic
                  ? `جارٍ التنزيل ${Math.round(brainProgress * 100)}%`
                  : `Downloading ${Math.round(brainProgress * 100)}%`
                : jarvis.modelState.status === 'error' && jarvis.settings.modelPath
                  ? arabic ? 'إعادة تحميل العقل' : 'Retry loading the brain'
                  : arabic ? 'تنزيل عقل JARVIS' : 'Download JARVIS brain'}
            </Text>
            <Text style={styles.brainSub}>
              {brainProgress !== null
                ? arabic ? 'أبقِ التطبيق مفتوحًا. يمكنك قفل الشاشة.' : 'Keep the app open. You can lock the screen.'
                : arabic ? 'Qwen3 4B · 2.5 جيجابايت · مجاني · يعمل دون إنترنت' : 'Qwen3 4B · 2.5 GB · free · runs offline'}
            </Text>
            {brainProgress !== null ? (
              <View style={styles.brainTrack}>
                <View style={[styles.brainFill, { width: `${Math.max(2, Math.round(brainProgress * 100))}%` }]} />
              </View>
            ) : null}
          </Pressable>
        ) : null}
        {jarvis.activeProject ? (
          <Pressable onPress={() => setInput(jarvis.activeProject?.nextAction ?? '')} style={styles.projectPill}>
            <Text style={styles.projectPillText} numberOfLines={1}>
              {jarvis.activeProject.name}
              {jarvis.activeProject.nextAction ? ` · ${jarvis.activeProject.nextAction}` : ''}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {response ? (
        <ScrollView style={styles.responseWrap} contentContainerStyle={styles.responseContent}>
          <Text style={styles.responseText}>{response}</Text>
          <Row>
            <Button title={arabic ? 'انطق' : 'Speak'} onPress={() => speakJarvis(response)} />
            <Button
              title={arabic ? 'احفظ في الذاكرة' : 'Save memory'}
              onPress={() => void jarvis.saveMemory('Saved JARVIS insight', response)}
            />
          </Row>
        </ScrollView>
      ) : null}

      <HudDrawer language={jarvis.settings.language}>
        <Text style={styles.metrics}>{formatPerformance(jarvis.lastMetrics)}</Text>
        <Field
          value={input}
          onChangeText={setInput}
          placeholder={arabic ? `قل «${jarvis.settings.wakeWord}» أو اكتب أمرًا…` : `Say “${jarvis.settings.wakeWord}”, or type a command…`}
        />
        <Row>
          <Button
            title={busy ? (arabic ? 'يعمل…' : 'Working…') : arabic ? 'إرسال' : 'Send'}
            onPress={() => void runCommand(input)}
            disabled={busy || !input.trim()}
          />
          {busy ? (
            <Button title={arabic ? 'إيقاف' : 'Stop'} onPress={() => void jarvis.stopGeneration()} />
          ) : (
            <Button
              title={orbTapStartsVoice(voice.state) ? (arabic ? 'صوت' : 'Voice') : arabic ? 'إيقاف الصوت' : 'Stop voice'}
              disabled={orbTapStartsVoice(voice.state) && !voice.isReady}
              onPress={toggleVoice}
            />
          )}
        </Row>
      </HudDrawer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  statusBar: { paddingHorizontal: 18, paddingTop: 8, gap: 2 },
  wordmark: { color: colors.accent, fontSize: 15, fontWeight: '900', letterSpacing: 6 },
  statusMeta: { color: colors.muted, fontSize: 11 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 14 },
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
  responseWrap: { maxHeight: 240 },
  responseContent: { paddingHorizontal: 18, paddingBottom: 12, gap: 12 },
  responseText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  metrics: { color: colors.muted, fontSize: 11 },
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
