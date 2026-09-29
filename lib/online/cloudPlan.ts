/**
 * Whether a question goes to the free cloud, and what happens if that fails.
 *
 * - 'local'           the phone answers; nothing leaves it (the default).
 * - 'cloud-only'      no local brain is loaded, so the cloud is all there is:
 *                     its own error is the answer.
 * - 'cloud-then-local' "cloud first" is on: try the cloud, and if it fails
 *                     (429, quota, offline, bad key) the phone answers in the
 *                     same turn, so the assistant never goes quiet.
 * Pure, so the rule is tested rather than trusted to a component.
 */
export type CloudPlan = 'local' | 'cloud-only' | 'cloud-then-local';

export function cloudPlan(input: { cloudEnabled: boolean; localReady: boolean; cloudFirst: boolean }): CloudPlan {
  if (!input.cloudEnabled) return 'local';
  if (!input.localReady) return 'cloud-only';
  return input.cloudFirst ? 'cloud-then-local' : 'local';
}
