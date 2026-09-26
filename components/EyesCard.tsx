import { useState } from 'react';
import { Alert } from 'react-native';
import { AppText, Button, Card } from '@/components/Ui';
import type { DownloadView } from '@/lib/inference/brainPresence';
import { downloadWithSystem, findModelFile, hasSystemDownloader } from '@/lib/inference/brainStore';
import { EYES_MODEL, EYES_PROJECTOR, EYES_TOTAL_MB } from '@/lib/vision/eyesFiles';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

/**
 * JARVIS's eyes: the small on-device vision model. Downloaded once through
 * Android's downloader (it keeps going with the app closed); after that
 * "what do you see?" works fully offline.
 */
export function EyesCard() {
  const [installed, setInstalled] = useState(() => Boolean(findModelFile(EYES_MODEL) && findModelFile(EYES_PROJECTOR)));
  const [view, setView] = useState<(DownloadView & { part: string }) | null>(null);

  async function install() {
    try {
      for (const [file, part] of [
        [EYES_PROJECTOR, 'projector'],
        [EYES_MODEL, 'vision model'],
      ] as const) {
        if (findModelFile(file)) continue;
        await downloadWithSystem((next) => setView({ ...next, part }), file);
      }
      setInstalled(true);
    } catch (error) {
      Alert.alert('Eyes not installed', humanizeError(errorMessage(error)));
    } finally {
      setView(null);
    }
  }

  if (!hasSystemDownloader()) {
    return (
      <Card title="Eyes">
        <AppText muted>This build cannot download the eyes. Install a newer JARVIS APK.</AppText>
      </Card>
    );
  }

  return (
    <Card title="Eyes">
      <AppText muted>
        Say “what do you see?” or tap Look. The camera opens only then, you take one photo, it is described on this phone,
        and the photo is deleted. Nothing leaves the phone.
      </AppText>
      {installed ? (
        <AppText>Installed · SmolVLM2 · works offline</AppText>
      ) : view ? (
        <AppText>
          Downloading {view.part} {view.progress === null ? '…' : `${Math.round(view.progress * 100)}%`}
          {view.note ? ` · ${view.note}` : ''}
        </AppText>
      ) : (
        <Button title={`Download eyes (${EYES_TOTAL_MB} MB)`} onPress={() => void install()} />
      )}
    </Card>
  );
}
