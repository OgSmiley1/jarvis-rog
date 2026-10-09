#!/usr/bin/env node
/**
 * Stage-timing table from a JARVIS live log (Settings → Live test link →
 * Share log, or the comments on the live channel pasted into a file).
 *
 *   node scripts/measure-voice-latency.mjs jarvis-log.txt
 *   pbpaste | node scripts/measure-voice-latency.mjs
 *
 * Reads what the phone measured; it never invents a number. Budgets are the
 * build brief's: first word < 3 s for a short answer, whole answer < 5 s.
 */
import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2] ?? 0, 'utf8');
const field = (line, key) => {
  const match = new RegExp(`(?:^|\\s)${key}=([^\\s]+)`).exec(line);
  return match && match[1] !== 'null' ? match[1] : null;
};

const rows = [];
const turns = [];
let pending = null;
for (const line of text.split('\n')) {
  const event = /^(\d\d:\d\d:\d\d\.\d{3}) (\w+)\s+(.*)$/.exec(line.trim());
  if (!event) continue;
  const [, at, kind, rest] = event;
  const [message] = rest.split(' · ');
  // Stage timings the phone measured per turn (Core brief, checkpoint 4).
  if (kind === 'LATENCY') {
    turns.push({ scenario: message.trim(), endToFirstAudio: field(rest, 'endToFirstAudio'), firstToken: field(rest, 'firstToken'), tool: field(rest, 'tool') });
  }
  if (kind === 'ASK') pending = { at, question: message.slice(0, 40), route: field(rest, 'route'), mode: field(rest, 'mode') };
  if (kind === 'ANSWER' && pending) {
    rows.push({
      ...pending,
      source: field(rest, 'source'),
      firstToken: field(rest, 'firstTokenMs'),
      firstSpeech: field(rest, 'firstSpeechMs'),
      total: field(rest, 'ms'),
      chars: field(rest, 'chars'),
    });
    pending = null;
  }
}

if (rows.length === 0 && turns.length === 0) {
  console.log('No ASK/ANSWER pairs or LATENCY turns found. Share the log from Settings → Live test link.');
  process.exit(1);
}

// End of speech → first audio, per scenario: median, p95 (nearest rank), n.
// Fewer than 30 runs is reported, never passed off as a result.
if (turns.length > 0) {
  const byScenario = new Map();
  for (const turn of turns) {
    if (turn.endToFirstAudio === null) continue;
    const list = byScenario.get(turn.scenario) ?? [];
    list.push(Number(turn.endToFirstAudio));
    byScenario.set(turn.scenario, list);
  }
  const pct = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(1, Math.ceil((p / 100) * sorted.length)) - 1];
  };
  console.table(
    [...byScenario.entries()].map(([scenario, values]) => ({
      scenario,
      n: values.length,
      'median (ms)': pct(values, 50),
      'p95 (ms)': pct(values, 95),
      enough: values.length >= 30 ? 'yes' : `no — need 30`,
    })),
  );
}
if (rows.length === 0) process.exit(0);

const ms = (value) => (value === null ? '—' : `${(Number(value) / 1000).toFixed(2)} s`);
const verdict = (row) => {
  const first = Number(row.firstSpeech ?? row.firstToken ?? row.total);
  return first <= 3000 && Number(row.total) <= 5000 ? 'within budget' : first <= 3000 ? 'first word OK' : 'SLOW';
};
console.table(
  rows.map((row) => ({
    time: row.at,
    question: row.question,
    route: row.source ?? row.route,
    'first token': ms(row.firstToken),
    'first speech': ms(row.firstSpeech),
    total: ms(row.total),
    verdict: verdict(row),
  })),
);
