import { describe, expect, it } from 'vitest';
import { cloudPlan } from '@/lib/online/cloudPlan';

describe('when a question goes to the free cloud', () => {
  it('off: nothing leaves the phone, whatever else is set', () => {
    expect(cloudPlan({ cloudEnabled: false, localReady: true, cloudFirst: true })).toBe('local');
    expect(cloudPlan({ cloudEnabled: false, localReady: false, cloudFirst: true })).toBe('local');
  });
  it('on, phone brain loaded, cloud-first off: the phone still answers', () => {
    expect(cloudPlan({ cloudEnabled: true, localReady: true, cloudFirst: false })).toBe('local');
  });
  it('on with no phone brain: the cloud is all there is', () => {
    expect(cloudPlan({ cloudEnabled: true, localReady: false, cloudFirst: false })).toBe('cloud-only');
    expect(cloudPlan({ cloudEnabled: true, localReady: false, cloudFirst: true })).toBe('cloud-only');
  });
  it('cloud first: try the cloud, the phone answers if it fails', () => {
    expect(cloudPlan({ cloudEnabled: true, localReady: true, cloudFirst: true })).toBe('cloud-then-local');
  });
});
