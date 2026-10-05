import type { CoreState } from '@/lib/core/CorePresets';
import type { HudPresentation, HudSignals, HudState } from '@/lib/hud/hudState';
import type { MicrophonePermission } from '@/lib/voice/microphone';
export interface RuntimeSignals extends HudSignals {
  phase?: CoreState; busy: boolean; localOnly: boolean; downloading: boolean;
  microphone: MicrophonePermission; voiceError?: string | null;
  /** Speech exists in the queue, but only `speaking` proves actual playback. */
  speechQueued?: boolean;
}
export interface RuntimePresentation extends HudPresentation { coreState: CoreState; isBusy: boolean; micActive: boolean }
const LABELS: Record<CoreState, [string, string]> = {
  idle: ['READY', 'جاهز'], listening: ['LISTENING', 'يستمع'], transcribing: ['UNDERSTANDING', 'يفهم'], thinking: ['THINKING', 'يفكّر'],
  local_inference: ['LOCAL INFERENCE', 'يفكّر محليًا'], tool_execution: ['EXECUTING', 'ينفّذ'], online_lookup: ['ONLINE LOOKUP', 'يبحث عبر الإنترنت'],
  speaking: ['SPEAKING', 'يتحدث'], success: ['DONE', 'تم'], warning: ['WARNING', 'تنبيه'], error: ['ERROR', 'خطأ'],
  local_only: ['LOCAL ONLY', 'محلي فقط'], model_loading: ['MODEL LOADING', 'يحمّل العقل'], model_downloading: ['DOWNLOADING', 'ينزّل العقل'], interrupted: ['STOPPED', 'توقف'],
};
/** The only user-facing state derivation. Stale phases/errors cannot override current playback/turn ownership. */
export function describeRuntime(s: RuntimeSignals): RuntimePresentation {
  const ar = s.language === 'ar';
  const micActive = s.microphone === 'granted' && !s.speechQueued && !s.speaking && ['LISTENING', 'TRANSCRIBING'].includes(s.voiceState);
  const voiceStarting = s.voiceState === 'REQUESTING_PERMISSION' || s.voiceState === 'INITIALIZING';
  let coreState: CoreState;
  if (s.speaking) coreState = 'speaking'; // actual playback, never synthesis/queue intent
  else if (s.busy) coreState = s.phase && ['local_inference', 'tool_execution', 'online_lookup'].includes(s.phase) ? s.phase : 'thinking';
  else if (s.speechQueued) coreState = 'thinking';
  else if (micActive) coreState = s.voiceState === 'TRANSCRIBING' ? 'transcribing' : 'listening';
  else if (voiceStarting) coreState = 'transcribing';
  else if (s.downloading) coreState = 'model_downloading';
  else if (s.modelStatus === 'loading') coreState = 'model_loading';
  else if (s.phase === 'interrupted' || s.phase === 'success' || s.phase === 'warning' || s.phase === 'error') coreState = s.phase;
  else if (s.voiceState === 'ERROR') coreState = s.microphone === 'granted' ? 'error' : 'warning';
  else coreState = s.localOnly ? 'local_only' : 'idle';
  const state: HudState = coreState === 'speaking' ? 'SPEAKING' : coreState === 'transcribing' && voiceStarting ? 'PREPARING' : ['listening', 'transcribing'].includes(coreState) ? 'LISTENING'
    : coreState === 'thinking' && s.speechQueued && !s.busy ? 'PREPARING' : coreState === 'tool_execution' ? 'TOOL_RUNNING' : ['thinking', 'local_inference', 'online_lookup'].includes(coreState) ? 'THINKING'
    : ['model_loading', 'model_downloading'].includes(coreState) ? 'PREPARING' : ['error', 'warning'].includes(coreState) ? 'ERROR' : 'READY';
  let detail = ar ? 'المس للتحدث أو افتح القائمة للكتابة.' : 'Tap to speak, or open Menu to type.';
  if (coreState === 'speaking') detail = ar ? 'يتحدث. المس للمقاطعة.' : 'Speaking. Tap to interrupt.';
  else if (s.busy) detail = LABELS[coreState][ar ? 1 : 0];
  else if (s.speechQueued) detail = ar ? 'يحضّر الرد الصوتي. المس للمقاطعة.' : 'Preparing spoken reply. Tap to interrupt.';
  else if (coreState === 'warning') detail = s.phase === 'warning' ? (ar ? 'راجع تفاصيل الرد.' : 'Check the response for details.') : (ar ? 'يلزم إذن الميكروفون. افتح إعدادات الأذونات.' : 'Microphone access is blocked. Allow it in app permissions.');
  else if (coreState === 'error') detail = s.phase !== 'error' && s.voiceState === 'ERROR' ? s.voiceError ?? (ar ? 'جلسة الصوت توقفت.' : 'Voice session stopped. Try again.') : (ar ? 'تعذر إتمام الطلب. يمكنك المحاولة مجددًا.' : 'That request failed. You can try again.');
  else if (coreState === 'transcribing' && voiceStarting) detail = ar ? 'يبدأ الميكروفون. لم يتم تأكيد التقاط الصوت بعد.' : 'Starting the microphone. Audio capture is not confirmed yet.';
  else if (coreState === 'interrupted') detail = ar ? 'توقف الطلب.' : 'Request stopped.';
  else if (coreState === 'listening') detail = s.handsFree ? (ar ? `قل «${s.wakeWord}» أو المس لطلب مباشر.` : `Say “${s.wakeWord}”, or tap for a direct request.`) : (ar ? 'تحدث الآن.' : 'Speak now.');
  else if (coreState === 'local_only') detail = ar ? 'الأدوات والنماذج المحلية فقط.' : 'Local tools and installed models only.';
  else if (coreState === 'model_loading' || coreState === 'model_downloading') detail = LABELS[coreState][ar ? 1 : 0];
  const headline = coreState === 'thinking' && s.speechQueued && !s.busy ? (ar ? 'يحضّر الرد' : 'PREPARING REPLY') : coreState === 'transcribing' && voiceStarting ? (ar ? 'يبدأ الميكروفون' : 'STARTING MICROPHONE') : coreState === 'warning' && s.phase !== 'warning' ? (ar ? 'الصوت غير متاح' : 'VOICE BLOCKED') : LABELS[coreState][ar ? 1 : 0];
  return { state, coreState, headline, detail, needsBrain: s.modelStatus === 'unloaded' || s.modelStatus === 'error', isBusy: state === 'THINKING' || state === 'TOOL_RUNNING', micActive: micActive && !s.speaking };
}
