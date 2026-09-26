import { ThermalStatus } from '@/lib/inference/thermalPlan';

/**
 * "Give me the system information", spoken from readings the phone actually
 * reports. Anything Android does not expose to an ordinary app (live CPU %,
 * GPU load) is simply not claimed; anything unreadable says "unknown".
 */

export interface SystemReadings {
  batteryLevel?: number;
  charging?: boolean;
  totalRamGb?: number;
  thermalStatus?: ThermalStatus;
  freeStorageGb?: number;
  brain: 'ready' | 'loading' | 'none' | 'cloud';
  brainName?: string;
}

const THERMAL_EN: Record<ThermalStatus, string> = {
  [ThermalStatus.None]: 'cool',
  [ThermalStatus.Light]: 'slightly warm',
  [ThermalStatus.Moderate]: 'warm, lightly throttled',
  [ThermalStatus.Severe]: 'hot, throttled',
  [ThermalStatus.Critical]: 'critically hot',
  [ThermalStatus.Emergency]: 'at emergency temperature',
  [ThermalStatus.Shutdown]: 'about to shut down from heat',
};
const THERMAL_AR: Record<ThermalStatus, string> = {
  [ThermalStatus.None]: 'بارد',
  [ThermalStatus.Light]: 'دافئ قليلًا',
  [ThermalStatus.Moderate]: 'دافئ مع خفض بسيط للأداء',
  [ThermalStatus.Severe]: 'ساخن والأداء مخفّض',
  [ThermalStatus.Critical]: 'ساخن جدًا',
  [ThermalStatus.Emergency]: 'في حالة طوارئ حرارية',
  [ThermalStatus.Shutdown]: 'على وشك الإطفاء بسبب الحرارة',
};

export function describeSystemStatus(r: SystemReadings, lang: 'en' | 'ar'): string {
  const ar = lang === 'ar';
  const unknown = ar ? 'غير معروف' : 'unknown';
  const battery =
    typeof r.batteryLevel === 'number' && r.batteryLevel >= 0
      ? `${Math.round(r.batteryLevel * 100)}%${r.charging ? (ar ? '، يشحن' : ', charging') : ''}`
      : unknown;
  const ram = typeof r.totalRamGb === 'number' ? (ar ? `${r.totalRamGb} جيجابايت` : `${r.totalRamGb} GB`) : unknown;
  const heat = r.thermalStatus === undefined ? unknown : (ar ? THERMAL_AR : THERMAL_EN)[r.thermalStatus];
  const storage =
    typeof r.freeStorageGb === 'number' ? (ar ? `${r.freeStorageGb.toFixed(1)} جيجابايت متاحة` : `${r.freeStorageGb.toFixed(1)} GB free`) : unknown;
  const brain = ar
    ? { ready: `العقل ${r.brainName ?? ''} محمّل`, loading: 'العقل يُحمَّل', none: 'لا يوجد عقل محلي', cloud: 'أعمل عبر العقل السحابي' }[r.brain]
    : { ready: `${r.brainName ?? 'the local brain'} is loaded`, loading: 'the brain is loading', none: 'no local brain is loaded', cloud: 'running on the cloud brain' }[r.brain];
  return ar
    ? `البطارية ${battery}. الذاكرة ${ram}. الحرارة: ${heat}. التخزين ${storage}. ${brain.trim()}.`
    : `Battery ${battery}. Memory ${ram}. Temperature: ${heat}. Storage ${storage}. And ${brain}.`;
}
