import { describe, expect, it } from 'vitest';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';
import { deriveHudState, describeHud } from '@/lib/hud/hudState';
import { visionPrompt } from '@/lib/vision/eyesFiles';

const route = (text: string) => {
  const found = routeDeterministicTool(text);
  return found ? { tool: found.call.tool, args: found.call.arguments } : null;
};

describe('the camera opens only when asked', () => {
  it.each(['Jarvis, what do you see?', 'what can you see', "what's this", 'look at this', 'describe this', 'ماذا ترى', 'شو تشوف', 'شوف هذا'])(
    '%s → vision.look',
    (text) => {
      expect(route(text)?.tool).toBe('vision.look');
    },
  );

  it('carries a specific question through', () => {
    expect(route('look at this and tell me what brand it is')).toEqual({
      tool: 'vision.look',
      args: { question: 'what brand it is', lang: 'en' },
    });
  });

  it('never for things that only sound visual', () => {
    expect(route('look up the weather')?.tool).toBe('phone.web_search');
    expect(route('show me my calendar')?.tool).toBe('phone.calendar');
    expect(route('open camera')?.tool).toBe('device.open_camera');
    expect(route('tell me a story')).toBeNull();
  });
});

describe('watching indicator', () => {
  const base = {
    modelStatus: 'ready' as const,
    voiceState: 'LISTENING' as const,
    generating: true,
    speaking: false,
    toolRunning: true,
    handsFree: true,
    wakeWord: 'jarvis',
    sttReady: true,
    language: 'en' as const,
  };
  it('outranks every other state while the camera is open', () => {
    expect(deriveHudState({ ...base, watching: true })).toBe('WATCHING');
    expect(describeHud({ ...base, watching: true }).detail).toContain('Camera on');
  });
  it('is gone the moment the look ends', () => {
    expect(deriveHudState({ ...base, watching: false })).toBe('TOOL_RUNNING');
  });
});

describe('vision prompt', () => {
  it('a plain look asks for a short spoken description', () => {
    expect(visionPrompt()).toMatch(/Describe what is in this photo/);
    expect(visionPrompt('what do you see?')).toMatch(/Describe what is in this photo/);
  });
  it('a specific question is asked as is', () => {
    expect(visionPrompt('what brand it is')).toBe('what brand it is Answer in one or two short spoken sentences.');
  });
});
