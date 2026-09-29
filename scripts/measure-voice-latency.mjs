#!/usr/bin/env node
// Voice latency probe. On the phone: Home -> "Share voice timings", save the
// JSON; then here:
//   node --experimental-strip-types scripts/measure-voice-latency.mjs timings.json
// Prints one row per turn (heard->ask, first token, first audio, user wait,
// total) and PASS/FAIL against the 5 s first-audio target.
import { readFileSync } from 'node:fs';
import { FIRST_AUDIO_TARGET_MS, stages, summarize } from '../lib/voice/latency.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: node --experimental-strip-types scripts/measure-voice-latency.mjs <timings.json>');
  process.exit(2);
}
const turns = JSON.parse(readFileSync(file, 'utf8'));
const ms = (value) => (typeof value === 'number' ? `${(value / 1000).toFixed(2)} s` : '—');
console.log('turn  route  heard->ask  first token  first audio  user wait  total');
turns.forEach((turn, index) => {
  const row = stages(turn);
  console.log(
    [String(index + 1).padEnd(4), (turn.route ?? '?').padEnd(5), ms(row.heardToAskMs).padStart(10), ms(row.firstTokenMs).padStart(11), ms(row.firstAudioMs).padStart(11), ms(row.userWaitMs).padStart(9), ms(row.totalMs).padStart(7)].join('  '),
  );
});
const summary = summarize(turns);
console.log(`\n${summary.spoken}/${summary.turns} spoken · p50 wait ${ms(summary.p50UserWaitMs)} · p95 wait ${ms(summary.p95UserWaitMs)} · p50 first token ${ms(summary.p50FirstTokenMs)}`);
console.log(`${summary.withinTarget}/${summary.spoken} under ${FIRST_AUDIO_TARGET_MS / 1000} s -> ${summary.pass ? 'PASS' : 'FAIL'}`);
process.exit(summary.pass ? 0 : 1);
