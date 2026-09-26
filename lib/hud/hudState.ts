import type { ModelRuntimeState } from '@/lib/inference/types';

/**
 * The single piece of state the ambient HUD renders. There is no tab bar to
 * tell the owner where he is any more, so the orb itself has to be legible at
 * a glance: one colour, one word, one line of detail.
 *
 * Every value below is derived from something the runtime actually reported.
 * There is deliberately no "READY" fallback for an unloaded model and no
 * acceleration claim — an unknown signal reads as unknown.
 */
export type HudState =
  | 'OFFLINE'
  | 'PREPARING'
  | 'READY'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'TOOL_RUNNING'
  | 'WATCHING'
  | 'ERROR';

export type HudLanguage = 'auto' | 'en' | 'ar';

export interface HudSignals {
  modelStatus: ModelRuntimeState['status'];
  /** Voice hook state, or 'UNAVAILABLE' where the native path does not exist. */
  voiceState: 'IDLE' | 'REQUESTING_PERMISSION' | 'INITIALIZING' | 'LISTENING' | 'TRANSCRIBING' | 'STOPPING' | 'ERROR' | 'UNAVAILABLE';
  /** A completion is streaming right now. */
  generating: boolean;
  /** Text-to-speech is playing right now. */
  speaking: boolean;
  /** An audited tool call is executing right now. */
  toolRunning: boolean;
  handsFree: boolean;
  wakeWord: string;
  /** Local STT weights are downloaded and the graph is loaded. */
  sttReady: boolean;
  /** 0..1 while the STT weights download, undefined when not measured. */
  sttProgress?: number;
  language: HudLanguage;
  /**
   * The cloud brain is switched on and has at least one key. When true, JARVIS
   * can answer even with no local model — so it must not claim otherwise.
   * Optional so existing callers keep their behaviour.
   */
  cloudReady?: boolean;
  /** The camera is open for an owner-requested look. Outranks everything: it must be unmistakable. */
  watching?: boolean;
}

export interface HudPresentation {
  state: HudState;
  /** One word, under the orb. */
  headline: string;
  /** One line. What JARVIS is doing, or what it is waiting for. */
  detail: string;
  /**
   * True when no local model is loaded and none is on its way. The HUD shows
   * a one-tap "download the brain" action whenever this is set.
   *
   * Observed on the owner's ROG Phone (Build e6e0246): the orb read LISTENING,
   * speech recognition was READY, and `Model: Not selected`. JARVIS could hear
   * every word and answer none of them, and nothing on the main screen said
   * why. The fix to that lives on the main screen, not three taps into
   * Settings.
   */
  needsBrain: boolean;
}

const HEADLINES: Record<HudState, { en: string; ar: string }> = {
  OFFLINE: { en: 'OFFLINE', ar: 'غير متصل' },
  PREPARING: { en: 'PREPARING', ar: 'يُحضّر' },
  READY: { en: 'READY', ar: 'جاهز' },
  LISTENING: { en: 'LISTENING', ar: 'يستمع' },
  THINKING: { en: 'THINKING', ar: 'يفكّر' },
  SPEAKING: { en: 'SPEAKING', ar: 'يتحدث' },
  TOOL_RUNNING: { en: 'EXECUTING', ar: 'ينفّذ' },
  WATCHING: { en: 'WATCHING', ar: 'يرى' },
  ERROR: { en: 'ERROR', ar: 'خطأ' },
};

function pick(language: HudLanguage, en: string, ar: string): string {
  return language === 'ar' ? ar : en;
}

/**
 * Priority order matters: what JARVIS is doing right now outranks what it is
 * capable of. A tool executing is the most specific fact available, an
 * unloaded model the least.
 */
export function deriveHudState(signals: HudSignals): HudState {
  if (signals.watching) return 'WATCHING';
  if (signals.toolRunning) return 'TOOL_RUNNING';
  if (signals.speaking) return 'SPEAKING';
  if (signals.generating) return 'THINKING';
  if (signals.voiceState === 'LISTENING' || signals.voiceState === 'TRANSCRIBING') return 'LISTENING';
  if (signals.modelStatus === 'loading') return 'PREPARING';
  if (signals.modelStatus === 'ready') return 'READY';
  // No local brain, but the cloud one can answer: that is a working
  // assistant, and calling it OFFLINE or ERROR would be false.
  if (signals.cloudReady) return 'READY';
  if (signals.modelStatus === 'error') return 'ERROR';
  return 'OFFLINE';
}

export function describeHud(signals: HudSignals): HudPresentation {
  const state = deriveHudState(signals);
  const { language } = signals;
  const headline = pick(language, HEADLINES[state].en, HEADLINES[state].ar);
  const needsBrain = signals.modelStatus === 'unloaded' || signals.modelStatus === 'error';

  const detail = ((): string => {
    // Listening with no brain is the state the owner actually hit on the
    // device. It must not read like a working assistant waiting for its cue.
    if (state === 'LISTENING' && needsBrain && !signals.cloudReady) {
      return pick(
        language,
        'I can hear you, but no brain is loaded yet — so I cannot answer. Tap Download below.',
        'أسمعك، لكن لا يوجد عقل محمّل بعد — لذا لا أستطيع الرد. اضغط تنزيل بالأسفل.',
      );
    }

    switch (state) {
      case 'WATCHING':
        return pick(
          language,
          'Camera on. One photo, described on this phone, then the camera is off.',
          'الكاميرا تعمل. صورة واحدة تُوصف على هذا الهاتف، ثم تُطفأ الكاميرا.',
        );
      case 'TOOL_RUNNING':
        return pick(language, 'Running an audited tool call.', 'ينفّذ أداة ضمن السجل المدقق.');
      case 'SPEAKING':
        return pick(language, 'Speaking. The microphone is muted until this finishes.', 'يتحدث. الميكروفون صامت حتى ينتهي.');
      case 'THINKING':
        return pick(language, 'Generating locally.', 'يولّد الإجابة محليًا.');
      case 'LISTENING':
        return signals.handsFree
          ? pick(
              language,
              `Hands-free. Say “${signals.wakeWord}” and then the command.`,
              `وضع بدون يدين. قل «${signals.wakeWord}» ثم الأمر.`,
            )
          : pick(language, 'Listening. Dictating into the command line.', 'يستمع. يكتب ما تقوله في سطر الأمر.');
      case 'ERROR':
        return pick(language, 'The local model reported an error. Open Settings.', 'النموذج المحلي أبلغ عن خطأ. افتح الإعدادات.');
      case 'PREPARING':
        return pick(language, 'Loading the local model into memory.', 'يحمّل النموذج المحلي في الذاكرة.');
      case 'READY':
        if (needsBrain && signals.cloudReady) {
          return pick(
            language,
            'Answering through the cloud until the local brain is downloaded. Questions leave the phone.',
            'أجيب عبر السحابة حتى يُنزَّل العقل المحلي. الأسئلة تغادر الهاتف.',
          );
        }
        if (!signals.sttReady) {
          const percent = typeof signals.sttProgress === 'number'
            ? ` · ${Math.max(0, Math.min(100, Math.round(signals.sttProgress * 100)))}%`
            : '';
          return pick(
            language,
            `Model loaded. Local speech recognition is still preparing${percent}.`,
            `النموذج جاهز. التعرّف على الكلام ما زال يُحضّر${percent}.`,
          );
        }
        if (signals.voiceState === 'ERROR') {
          return pick(language, 'Model loaded. The voice session stopped — tap the orb to restart it.', 'النموذج جاهز. جلسة الصوت توقفت — المس الكرة لإعادة تشغيلها.');
        }
        return signals.handsFree
          ? pick(language, `Say “${signals.wakeWord}”.`, `قل «${signals.wakeWord}».`)
          : pick(language, 'Tap the orb to speak, or type below.', 'المس الكرة للتحدث، أو اكتب بالأسفل.');
      case 'OFFLINE':
      default:
        return pick(
          language,
          'No brain loaded yet. One tap below downloads it — about 2.5 GB, free, and it runs fully offline after that.',
          'لا يوجد عقل محمّل بعد. ضغطة واحدة بالأسفل تنزّله — حوالي 2.5 جيجابايت، مجانًا، ويعمل دون إنترنت بعدها.',
        );
    }
  })();

  return { state, headline, detail, needsBrain };
}

/** True when tapping the orb should start a voice session rather than stop one. */
export function orbTapStartsVoice(voiceState: HudSignals['voiceState']): boolean {
  return voiceState === 'IDLE' || voiceState === 'ERROR';
}
