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
}

export interface HudPresentation {
  state: HudState;
  /** One word, under the orb. */
  headline: string;
  /** One line. What JARVIS is doing, or what it is waiting for. */
  detail: string;
}

const HEADLINES: Record<HudState, { en: string; ar: string }> = {
  OFFLINE: { en: 'OFFLINE', ar: 'غير متصل' },
  PREPARING: { en: 'PREPARING', ar: 'يُحضّر' },
  READY: { en: 'READY', ar: 'جاهز' },
  LISTENING: { en: 'LISTENING', ar: 'يستمع' },
  THINKING: { en: 'THINKING', ar: 'يفكّر' },
  SPEAKING: { en: 'SPEAKING', ar: 'يتحدث' },
  TOOL_RUNNING: { en: 'EXECUTING', ar: 'ينفّذ' },
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
  if (signals.toolRunning) return 'TOOL_RUNNING';
  if (signals.speaking) return 'SPEAKING';
  if (signals.generating) return 'THINKING';
  if (signals.voiceState === 'LISTENING' || signals.voiceState === 'TRANSCRIBING') return 'LISTENING';
  if (signals.modelStatus === 'error') return 'ERROR';
  if (signals.modelStatus === 'loading') return 'PREPARING';
  if (signals.modelStatus === 'ready') return 'READY';
  return 'OFFLINE';
}

export function describeHud(signals: HudSignals): HudPresentation {
  const state = deriveHudState(signals);
  const { language } = signals;
  const headline = pick(language, HEADLINES[state].en, HEADLINES[state].ar);

  const detail = ((): string => {
    switch (state) {
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
        return pick(language, 'No local model loaded yet. Open Settings to import a GGUF.', 'لا يوجد نموذج محلي محمّل. افتح الإعدادات لاستيراد ملف GGUF.');
    }
  })();

  return { state, headline, detail };
}

/** True when tapping the orb should start a voice session rather than stop one. */
export function orbTapStartsVoice(voiceState: HudSignals['voiceState']): boolean {
  return voiceState === 'IDLE' || voiceState === 'ERROR';
}
