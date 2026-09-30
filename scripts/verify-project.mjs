import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let reportPath;
let apkPath;
let exportAndroid = false;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--android-export') exportAndroid = true;
  else if ((arg === '--report' || arg === '--apk') && args[index + 1] && !args[index + 1].startsWith('--')) {
    const value = resolve(args[++index]);
    if (arg === '--report') reportPath = value;
    else apkPath = value;
  } else {
    console.error('Usage: node scripts/verify-project.mjs [--report file.json] [--android-export] [--apk file.apk]');
    process.exit(2);
  }
}
const git = (...commandArgs) => spawnSync('git', commandArgs, { cwd: root, encoding: 'utf8' }).stdout?.trim() ?? '';
const report = {
  startedAt: new Date().toISOString(),
  commit: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'),
  dirty: Boolean(git('status', '--porcelain')),
  node: process.version,
  packageManager: JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).packageManager,
  gates: [],
  apk: null,
  nativeBuild: 'NOT RUN',
  deviceTests: 'NOT RUN',
};
const commands = [
  ['TypeScript', 'corepack', ['pnpm', 'check']],
  ['Lint', 'corepack', ['pnpm', 'lint']],
  ['Unit tests', 'corepack', ['pnpm', 'test']],
  ['Smoke', 'node', ['scripts/smoke-test.mjs']],
  ['Acceptance report structure', 'node', ['scripts/acceptance-report.mjs']],
];
if (exportAndroid) {
  const output = mkdtempSync(resolve(tmpdir(), 'jarvis-export-'));
  commands.push(['Android JS export', 'corepack', ['pnpm', 'exec', 'expo', 'export', '--platform', 'android', '--output-dir', output]]);
}
let exitCode = 0;
try {
  for (const [gate, command, commandArgs] of commands) {
    console.log(`\n> ${command} ${commandArgs.join(' ')}`);
    const startedAt = Date.now();
    const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    report.gates.push({ gate, result: result.status === 0 ? 'PASS' : 'FAIL', durationMs: Date.now() - startedAt });
    if (result.error) console.error(result.error.message);
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
  if (!exitCode && apkPath) {
    const zip = spawnSync('unzip', ['-Z1', apkPath], { encoding: 'utf8' });
    if (zip.error || zip.status !== 0) throw new Error(zip.error?.message ?? 'Cannot inspect APK: install unzip and supply a readable APK.');
    const entries = zip.stdout.split(/\r?\n/);
    const checks = {
      inference: entries.some((entry) => /^lib\/arm64-v8a\/librnllama.*\.so$/.test(entry)),
      audio: entries.some((entry) => /^lib\/arm64-v8a\/.*audio.*\.so$/i.test(entry)),
      bundle: entries.includes('assets/index.android.bundle'),
      manifest: entries.includes('AndroidManifest.xml'),
    };
    const bytes = readFileSync(apkPath);
    report.apk = { path: apkPath, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length, checks, sourceCommit: 'NOT VERIFIED' };
    const passed = Object.values(checks).every(Boolean);
    report.gates.push({ gate: 'APK contents', result: passed ? 'PASS' : 'FAIL' });
    if (!passed) throw new Error('APK is missing required native libraries, manifest or JS bundle.');
  }
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.result = exitCode === 0 ? 'PASS' : 'FAIL';
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Verification report: ${reportPath}`);
  }
}
if (!exitCode) console.log('\nSoftware verification passed. Native compilation and physical-device tests need separate evidence.');
process.exitCode = exitCode;
