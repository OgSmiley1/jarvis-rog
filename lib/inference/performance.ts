import type { RuntimeMetrics } from './types';

export function formatPerformance(metrics?: RuntimeMetrics): string {
  if (!metrics) return 'No runtime measurement yet';
  const parts: string[] = [];
  if (typeof metrics.firstTokenMs === 'number') parts.push(`TTFT ${Math.round(metrics.firstTokenMs)} ms`);
  if (typeof metrics.tokensPerSecond === 'number') parts.push(`${metrics.tokensPerSecond.toFixed(1)} tok/s`);
  parts.push(`Total ${Math.round(metrics.totalMs)} ms`);
  return parts.join(' · ');
}
