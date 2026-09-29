/**
 * Which brain answers, in what order. Offline-first: the phone's own model is
 * the default and always the last resort. When the owner turns the free cloud
 * on, it is tried first (much faster: ~300 tok/s vs ~6 on the phone), and any
 * failure — 429, quota, no network, bad key — falls straight through to the
 * local model in the same turn. Pure, so the rules are tested.
 */
export type BrainId = 'cloud' | 'local';

export function brainOrder(input: { localReady: boolean; cloudEnabled: boolean; cloudKeys: number }): BrainId[] {
  const order: BrainId[] = [];
  if (input.cloudEnabled && input.cloudKeys > 0) order.push('cloud');
  if (input.localReady) order.push('local');
  return order;
}
