import { useSyncExternalStore } from 'react';
import { isLocalOnly, subscribeNetworkPolicy } from '@/lib/net/localOnly';
import { useEffect, useMemo, useState } from 'react';
import { Paths } from 'expo-file-system';
import {
  adoptModelFile,
  downloadWithSystem,
  findModelFile,
  hasSystemDownloader,
  type ModelFile,
} from '@/lib/inference/brainStore';
import { recordLive } from '@/lib/telemetry/liveLog';
import { collectUrls, libraryCacheName, localizeConfig, voiceFileName } from '@/lib/voice/voiceFiles';

export interface LocalVoiceModel<T> {
  /** The config to hand the voice library: local files once they are on the phone. */
  config: T;
  /** False while files are still being fetched; the library must not load yet. */
  ready: boolean;
  /** 0..1 across all of this model's files. */
  progress: number;
}

/**
 * Keeps a voice model's files in the permanent Download/JARVIS folder.
 *
 * Each file is taken from that folder if it is there, else copied from the
 * voice library's old private cache (so a phone that already downloaded it
 * never downloads it again), else fetched once by Android's DownloadManager,
 * which carries on with the app closed. Only when every file is local does
 * the library get the config, pointing at those files.
 *
 * Without the system downloader or permanent storage, the library's own
 * download is used as before.
 */
export function useLocalVoiceModel<T>(remote: T, enabled = true): LocalVoiceModel<T> {
  const managed = hasSystemDownloader();
  const localOnly = useSyncExternalStore(subscribeNetworkPolicy, isLocalOnly, isLocalOnly);
  const urls = useMemo(() => collectUrls(remote), [remote]);
  const [local, setLocal] = useState<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!managed || !enabled) return;
    let cancelled = false;
    void (async () => {
      const paths = new Map<string, string>();
      for (const [index, url] of urls.entries()) {
        const file: ModelFile = { url, name: voiceFileName(url), title: `JARVIS voice (${index + 1}/${urls.length})`, minBytes: 1 };
        let found = findModelFile(file);
        if (!found) {
          // Files the voice library downloaded into its own cache before this build.
          const cached = `${Paths.document.uri.replace(/\/$/, '')}/react-native-executorch/${libraryCacheName(url)}`;
          if (await adoptModelFile(cached, file.name)) found = findModelFile(file);
        }
        if (!found) {
          recordLive('voice', 'voice file download', { file: file.name });
          found = await downloadWithSystem((view) => {
            if (!cancelled) setProgress((index + (view.progress ?? 0)) / urls.length);
          }, file);
        }
        if (cancelled) return;
        paths.set(url, found.path);
        setProgress((index + 1) / urls.length);
      }
      if (!cancelled) setLocal(localizeConfig(remote, (url) => paths.get(url) ?? url));
    })().catch((error) => {
      recordLive('error', 'voice files failed', { raw: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [managed, enabled, remote, urls, localOnly]);

  if (!managed) return { config: remote, ready: !localOnly, progress: 1 };
  return { config: local ?? remote, ready: local !== null, progress };
}
