import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { initLlama, type LlamaContext } from 'llama.rn';
import { findModelFile } from '@/lib/inference/brainStore';
import { stripThinking } from '@/lib/voice/stripThinking';
import { EYES_MODEL, EYES_PROJECTOR, visionPrompt } from './eyesFiles';

/**
 * Owner-triggered sight. Nothing here runs unless the owner asks: the camera
 * opens only through Android's own camera screen (the owner takes the one
 * photo), the photo is described on the phone, and the file is deleted as
 * soon as the description exists. There is no background capture path.
 */

let context: LlamaContext | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const IDLE_RELEASE_MS = 3 * 60_000;

export function eyesInstalled(): boolean {
  return Boolean(findModelFile(EYES_MODEL) && findModelFile(EYES_PROJECTOR));
}

/** Opens the camera for one photo. Null if the owner backed out. */
export async function captureFrame(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('CAMERA_PERMISSION_DENIED');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5, exif: false, allowsEditing: false });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

async function ensureContext(): Promise<LlamaContext> {
  if (idleTimer) clearTimeout(idleTimer);
  if (context) return context;
  const model = findModelFile(EYES_MODEL);
  const projector = findModelFile(EYES_PROJECTOR);
  if (!model || !projector) throw new Error('EYES_NOT_INSTALLED');
  const created = await initLlama({
    model: model.path.replace(/^file:\/\//, ''),
    n_ctx: 4096,
    n_gpu_layers: 0,
    use_mmap: true,
    ctx_shift: false,
  });
  const ok = await created.initMultimodal({ path: projector.path, use_gpu: false });
  if (!ok) {
    await created.release();
    throw new Error('EYES_PROJECTOR_FAILED');
  }
  context = created;
  return created;
}

function scheduleRelease() {
  if (idleTimer) clearTimeout(idleTimer);
  // Give the RAM back when the eyes have not been used for a while.
  idleTimer = setTimeout(() => {
    const current = context;
    context = null;
    void current?.release();
  }, IDLE_RELEASE_MS);
}

export async function describeFrame(uri: string, question?: string): Promise<string> {
  try {
    const eyes = await ensureContext();
    const result = await eyes.completion({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: uri } },
            { type: 'text', text: visionPrompt(question) },
          ],
        },
      ],
      n_predict: 160,
      temperature: 0.2,
      stop: ['<end_of_utterance>', '<|im_end|>', '</s>'],
    });
    const text = stripThinking(result.text).trim();
    if (!text) throw new Error('EYES_EMPTY_DESCRIPTION');
    return text;
  } finally {
    scheduleRelease();
    try {
      const photo = new File(uri);
      if (photo.exists) photo.delete();
    } catch {
      // The picker's cache copy is also cleared by Android; never fail a description over it.
    }
  }
}
