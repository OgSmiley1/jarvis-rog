import { describe, expect, it, vi } from 'vitest';

const placeCall = vi.fn(() => 'dialer' as const);
vi.mock('@/lib/device/phone', () => ({
  phone: () => ({
    findContacts: async () => [{ name: 'Mom', number: '+971 50 111 2222', type: 'Mobile' }],
    placeCall,
  }),
}));

const { phoneTools } = await import('@/lib/tools/phoneTools');

describe('"call Mom" opens the dialler; the owner presses Call', () => {
  const call = phoneTools.find((tool) => tool.name === 'phone.call')!;

  it('hands the number to the dialler and says so', async () => {
    const result = (await call.execute({ who: 'Mom', lang: 'en' })) as { speech: string };
    expect(placeCall).toHaveBeenCalledWith('+971 50 111 2222');
    expect(result.speech).toBe('Dialer ready for Mom. Tap Call.');
    expect(result.speech).not.toMatch(/^Calling/);
  });

  it('tells the planner it never places the call itself', () => {
    expect(call.description).toMatch(/never places the call/);
  });
});
