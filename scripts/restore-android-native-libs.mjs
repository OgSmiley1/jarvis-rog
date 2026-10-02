// Restore only Android's pinned, checksum-verified llama.rn artifact.
// curl honors HTTPS_PROXY, unlike this dependency's install-time downloader.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = dirname(realpathSync(require.resolve('llama.rn/package.json')));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const artifact = JSON.parse(readFileSync(resolve(root, 'install/native-artifacts.json'), 'utf8')).artifacts.find(a => a.name === 'android-jni-libs');
if (!artifact || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Invalid native artifact manifest');
const marker = resolve(root, artifact.markerPath);
if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === artifact.sha256 && existsSync(resolve(root, artifact.relativePath, 'arm64-v8a/librnllama.so'))) {
  console.log('Pinned Android inference libraries are installed.');
  process.exit(0);
}
const cache = resolve(process.env.JARVIS_BUILD_CACHE ?? '.build-cache');
mkdirSync(cache, { recursive: true });
const archive = resolve(cache, artifact.assetName);
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${cmd} failed (${result.status})`);
};
const valid = () => existsSync(archive) && createHash('sha256').update(readFileSync(archive)).digest('hex') === artifact.sha256;
if (!valid()) run('curl', ['--fail', '--location', '--retry', '3', '--output', archive, `https://github.com/mybigday/llama.rn/releases/download/v${pkg.version}/${artifact.assetName}`]);
if (!valid()) throw new Error('Native artifact checksum mismatch; refusing to extract');
run('tar', ['-xzf', archive, '-C', root]);
mkdirSync(dirname(marker), { recursive: true });
writeFileSync(marker, `${artifact.sha256}\n`);
console.log('Android inference artifact restored and checksum verified.');
