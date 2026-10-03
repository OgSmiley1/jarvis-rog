import { routeDeterministicTool, type DeterministicToolRoute } from './deterministicRouter';
import { createId } from '@/lib/utils/ids';

/** Ephemeral, structured tool slots. Never written to personal memory. */
export interface RecentToolContext {
  tool: 'live.weather' | 'live.prayer';
  parameters: Record<string, unknown>;
  at: number;
}
const FOLLOW_UP = /^(?:what\s+about|how\s+about|and|ماذا\s+عن|وماذا\s+عن|وش\s+عن|و)\s+(.+)$/iu;
const TOMORROW = /\btomorrow\b|بكرة|بكره|غدًا|غداً|غدا|باكر/giu;
const TODAY = /\btoday\b|اليوم/giu;

export class ToolConversation {
  private recent: RecentToolContext | null = null;
  constructor(private readonly now = Date.now) {}
  clear(): void { this.recent = null; }
  snapshot(): RecentToolContext | null {
    return this.recent ? { ...this.recent, parameters: { ...this.recent.parameters } } : null;
  }
  resolve(text: string, continuesSession = true): DeterministicToolRoute | null {
    if (!continuesSession || (this.recent && this.now() - this.recent.at > 5 * 60_000)) this.clear();
    const clean = text.trim().replace(/[?!؟.]+$/u, '');
    const follow = clean.match(FOLLOW_UP);
    if (follow && this.recent) {
      const parameters = { ...this.recent.parameters };
      let slots = follow[1]!.trim();
      const tomorrow = slots.search(TOMORROW) >= 0;
      const today = slots.search(TODAY) >= 0;
      slots = slots.replace(TOMORROW, '').replace(TODAY, '');
      if (tomorrow || today) {
        if (this.recent.tool === 'live.weather') parameters.day = tomorrow ? 'tomorrow' : 'today';
        else parameters.tomorrow = tomorrow;
      }
      if (this.recent.tool === 'live.weather') {
        if (/\bfahrenheit\b/iu.test(slots)) parameters.unit = 'fahrenheit';
        if (/\bcelsius\b/iu.test(slots)) parameters.unit = 'celsius';
        slots = slots.replace(/\b(?:fahrenheit|celsius)\b/giu, '');
      }
      slots = slots.trim().replace(/^(?:in|for|at|في)(?:\s+|$)/iu, '').trim();
      // A slot-only follow-up may update a location, date, or unit. Full new
      // commands and clauses are handled by the normal router below.
      const city = /^[\p{L}\p{M} .'-]{2,60}$/u.test(slots) && !/\b(?:weather|prayer|tell|explain|open|call|news|timer|calculate|is|are)\b/iu.test(slots);
      if (!slots || city) {
        if (city) parameters.city = slots;
        parameters.lang = /[\u0600-\u06ff]/u.test(text) ? 'ar' : 'en';
        this.recent = { ...this.recent, parameters, at: this.now() };
        return { call: { id: createId('tool'), tool: this.recent.tool, arguments: parameters }, successMessage: 'Done.' };
      }
    }
    const routed = routeDeterministicTool(text);
    if (routed && (routed.call.tool === 'live.weather' || routed.call.tool === 'live.prayer')) {
      this.recent = { tool: routed.call.tool, parameters: { ...routed.call.arguments }, at: this.now() };
    } else this.clear();
    return routed;
  }
}
