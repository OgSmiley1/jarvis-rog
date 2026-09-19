import { spawnSync } from 'node:child_process';

const commands = [
  ['pnpm', ['check']],
  ['pnpm', ['lint']],
  ['pnpm', ['test']],
  ['node', ['scripts/smoke-test.mjs']],
];

for (const [command, args] of commands) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('\nStatic verification passed. Native build and physical-device tests remain separate gates.');
