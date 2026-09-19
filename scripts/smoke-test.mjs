import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'package.json',
  'app.config.ts',
  'app/_layout.tsx',
  'app/(tabs)/index.tsx',
  'lib/inference/standaloneModel.native.ts',
  'lib/storage/database.ts',
  'lib/tools/router.ts',
  'termux/jarvis_bridge/server.py',
  '.claude/JARVIS_STATE.md',
];

let failed = false;
for (const item of required) {
  const exists = fs.existsSync(path.join(root, item));
  console.log(`${exists ? 'PASS' : 'FAIL'} ${item}`);
  if (!exists) failed = true;
}
process.exitCode = failed ? 1 : 0;
