/**
 * The voice's files (speech recognition, voice activity, the neural voice)
 * kept in the permanent Download/JARVIS folder like the brain, instead of the
 * voice library's private cache, which an interrupted download restarted from
 * zero and an uninstall wiped.
 *
 * The library's model configs are plain objects whose sources are URLs. These
 * helpers find every URL in a config and swap each for the local file once it
 * is on the phone. No native or Expo imports, so this is unit-tested.
 */

const HOST = /^https:\/\/huggingface\.co\/software-mansion\/react-native-executorch-([^/]+)\/resolve\/([^/]+)\/(.+)$/;

/**
 * Where a voice file lives inside the model folder, from its URL:
 * `.../react-native-executorch-whisper-tiny/resolve/v0.9.0/tokenizer.json`
 * → `voice/whisper-tiny/v0.9.0/tokenizer.json`. The version is kept in the
 * path, so a library update that ships new files never reuses stale ones.
 */
export function voiceFileName(url: string): string {
  const clean = url.split('?')[0]!;
  const match = HOST.exec(clean);
  if (match) return `voice/${match[1]}/${match[2]}/${match[3]}`;
  // Any other host: keep the path, drop anything unsafe.
  const path = clean.replace(/^https?:\/\/[^/]+\//, '').replace(/[^A-Za-z0-9._/-]/g, '_');
  return `voice/other/${path}`;
}

/** Every remote URL in a model config, once each, in order. */
export function collectUrls(config: unknown): string[] {
  const found: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      if (/^https?:\/\//.test(value) && !found.includes(value)) found.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  };
  walk(config);
  return found;
}

/** A copy of the config with each URL replaced by its local file (as `file://…`). */
export function localizeConfig<T>(config: T, localPath: (url: string) => string): T {
  const swap = (value: unknown): unknown => {
    if (typeof value === 'string') return /^https?:\/\//.test(value) ? localPath(value) : value;
    if (Array.isArray(value)) return value.map(swap);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, swap(inner)]));
    }
    return value;
  };
  return swap(config) as T;
}

/** The file name the voice library itself gave a download (its last path segment). */
export function libraryCacheName(url: string): string {
  return url.split('?')[0]!.split('/').pop() ?? url;
}
