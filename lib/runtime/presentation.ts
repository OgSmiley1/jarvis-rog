import type { CoreState } from '@/lib/core/CorePresets';
import type { HudPresentation, HudSignals, HudState } from '@/lib/hud/hudState';
import type { MicrophonePermission } from '@/lib/voice/microphone';
export interface RuntimeSignals extends HudSignals {
  phase?: CoreState; busy: boolean; localOnly: boolean; downloading: boolean;
  microphone: MicrophonePermission; voiceError?: string | null;
}
export interface RuntimePresentation extends HudPresentation { coreState: CoreState; isBusy: boolean; micActive: boolean }
const LABELS: Record<CoreState, [string, string]> = {
  idle: ['READY', 'جاهز'], listening: ['LISTENING', 'يستمع'], transcribing: ['UNDERSTANDING', 'يفهم'], thinking: ['THINKING', 'يفكّر'],
  local_inference: ['LOCAL INFERENCE', 'يفكّر محليًا'], tool_execution: ['EXECUTING', 'ينفّذ'], online_lookup: ['ONLINE LOOKUP', 'يبحث عبر الإنترنت'],
  speaking: ['SPEAKING', 'يتحدث'], success: ['DONE', 'تم'], warning: ['VOICE BLOCKED', 'الصوت غير متاح'], error: ['ERROR', 'خطأ'],
  local_only: ['LOCAL ONLY', 'محلي فقط'], model_loading: ['MODEL LOADING', 'يحمّل العقل'], model_downloading: ['DOWNLOADING', 'ينزّل العقل'], interrupted: ['STOPPED', 'توقف'],
};
/** The only user-facing state derivation. Stale phases/errors cannot override current playback/turn ownership. */
export function describeRuntime(s: RuntimeSignals): RuntimePresentation {
  const ar = s.language === 'ar';
  const micActive = s.microphone === 'granted' && ['LISTENING', 'TRANSCRIBING'].includes(s.voiceState);
  let coreState: CoreState;
  if (s.speaking) coreState = 'speaking'; // actual playback, never synthesis/queue intent
  else if (s.busy) coreState = s.phase && ['local_inference', 'tool_execution', 'online_lookup'].includes(s.phase) ? s.phase : 'thinking';
  else if (micActive) coreState = s.voiceState === 'TRANSCRIBING' ? 'transcribing' : 'listening';
  else if (s.voiceState === 'REQUESTING_PERMISSION' || s.voiceState === 'INITIALIZING') coreState = 'transcribing';
  else if (s.downloading) coreState = 'model_downloading';
  else if (s.modelStatus === 'loading') coreState = 'model_loading';
  else if (s.phase === 'interrupted' || s.phase === 'success' || s.phase === 'error') coreState = s.phase;
  else if (s.voiceState === 'ERROR') coreState = s.microphone === 'granted' ? 'error' : 'warning';
  else coreState = s.localOnly ? 'local_only' : 'idle';
  const state: HudState = coreState === 'speaking' ? 'SPEAKING' : ['listening', 'transcribing'].includes(coreState) ? 'LISTENING'
    : coreState === 'tool_execution' ? 'TOOL_RUNNING' : ['thinking', 'local_inference', 'online_lookup'].includes(coreState) ? 'THINKING'
    : ['model_loading', 'model_downloading'].includes(coreState) ? 'PREPARING' : ['error', 'warning'].includes(coreState) ? 'ERROR' : 'READY';
  let detail = ar ? 'المس للتحدث أو افتح القائمة للكتابة.' : 'Tap to speak, or open Menu to type.';
  if (coreState === 'speaking') detail = ar ? 'يتحدث. المس للمقاطعة.' : 'Speaking. Tap to interrupt.';
  else if (s.busy) detail = LABELS[coreState][ar ? 1 : 0];
  else if (coreState === 'warning') detail = ar ? 'يلزم إذن الميكروفون. افتح إعدادات الأذونات.' : 'Microphone access is blocked. Allow it in app permissions.';
  else if (coreState === 'error') detail = s.voiceState === 'ERROR' ? s.voiceError ?? (ar ? 'جلسة الصوت توقفت.' : 'Voice session stopped. Try again.') : (ar ? 'تعذر إتمام الطلب. يمكنك المحاولة مجددًا.' : 'That request failed. You can try again.');
  else if (coreState === 'interrupted') detail = ar ? 'توقف الطلب.' : 'Request stopped.';
  else if (coreState === 'listening') detail = s.handsFree ? (ar ? `قل «${s.wakeWord}» أو المس لطلب مباشر.` : `Say “${s.wakeWord}”, or tap for a direct request.`) : (ar ? 'تحدث الآن.' : 'Speak now.');
  else if (coreState === 'local_only') detail = ar ? 'الأدوات والنماذج المحلية فقط.' : 'Local tools and installed models only.';
  else if (coreState === 'model_loading' || coreState === 'model_downloading') detail = LABELS[coreState][ar ? 1 : 0];
  return { state, coreState, headline: LABELS[coreState][ar ? 1 : 0], detail, needsBrain: s.modelStatus === 'unloaded' || s.modelStatus === 'error', isBusy: s.busy, micActive: micActive && !s.speaking };
}
