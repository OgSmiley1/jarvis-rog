import type { HudState } from '@/lib/hud/hudState';

/**
 * The fallback Core's look, per state. Used only if the Skia Core fails to
 * render: plain Views, no native drawing engine, so the assistant stays
 * usable whatever happens. Pure, so every state is covered by a test.
 */
export interface FallbackLook {
  ring: string;
  accent: string;
  /** 0..1 opacity of the rings. */
  glow: number;
}

const RED = '#ff2a1a';
const TEAL = '#2ee6d6';

export const FALLBACK_LOOKS: Record<HudState, FallbackLook> = {
  OFFLINE: { ring: RED, accent: TEAL, glow: 0.4 },
  PREPARING: { ring: RED, accent: TEAL, glow: 0.5 },
  READY: { ring: RED, accent: TEAL, glow: 0.6 },
  LISTENING: { ring: RED, accent: TEAL, glow: 1 },
  THINKING: { ring: RED, accent: TEAL, glow: 0.9 },
  TOOL_RUNNING: { ring: RED, accent: TEAL, glow: 0.9 },
  SPEAKING: { ring: RED, accent: TEAL, glow: 1 },
  WATCHING: { ring: RED, accent: '#B388FF', glow: 0.9 },
  ERROR: { ring: '#8a1a12', accent: '#5a1a14', glow: 0.5 },
};

/** Error-boundary state transition, kept pure so it is testable without React. */
export function coreErrorState(error: unknown): { failed: true; reason: string } {
  return { failed: true, reason: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) };
}
