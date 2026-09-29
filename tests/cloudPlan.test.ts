import { describe, expect, it } from 'vitest';
import { buildMessages } from '@/lib/inference/promptBuilder';
import { cloudPlan, cloudSeesPersonalContext } from '@/lib/online/cloudPlan';

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

describe('what the cloud may see', () => {
  const personal = { mode: 'fast' as const, userMessage: 'plan my week', memoryContext: 'Owner keeps a Rolex Daytona', projectContext: 'Project: SECRET-PLAN', ownerProfileContext: 'Owner is Sheikh X' };

  it('cloud first keeps memories, projects and the profile on the phone', () => {
    expect(cloudSeesPersonalContext('cloud-then-local')).toBe(false);
    const sent = JSON.stringify(buildMessages({ mode: personal.mode, userMessage: personal.userMessage }));
    for (const secret of ['Daytona', 'SECRET-PLAN', 'Sheikh X']) expect(sent).not.toContain(secret);
  });

  it('the full prompt still carries them for the phone itself', () => {
    const local = JSON.stringify(buildMessages(personal));
    expect(local).toContain('SECRET-PLAN');
  });

  it('with no local brain the old fallback sends the full prompt, as agreed when it was switched on', () => {
    expect(cloudSeesPersonalContext('cloud-only')).toBe(true);
  });
});
