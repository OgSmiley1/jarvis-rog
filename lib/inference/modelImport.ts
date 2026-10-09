import { assertNetworkAllowed, subscribeNetworkPolicy, isLocalOnly } from '@/lib/net/localOnly';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

/** Larger legacy brain remains compatible and is preserved if installed/selected. */
export const LARGER_MODEL = {
  name: 'Qwen3-8B-Q4_K_M.gguf',
  url: 'https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf?download=true',
  approximateBytes: 5_027_783_488,
  minBytes: 4_500_000_000,
} as const;

/** Default one-time brain: Qwen3 4B Q4_K_M, about 2.5 GB. */
export const RECOMMENDED_MODEL = {
  name: 'Qwen3-4B-Q4_K_M.gguf',
  url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf?download=true',
  approximateBytes: 2_497_280_256,
  minBytes: 2_000_000_000,
} as const;

export const PREVIOUS_MODEL = LARGER_MODEL;

export interface ImportedModel {
  path: string;
  name: string;
  size: number;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function importGgufModel(): Promise<ImportedModel | null> {
  const picker = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (picker.canceled) return null;
  const asset = picker.assets[0];
  if (!asset) throw new Error('MODEL_PICKER_EMPTY');
  if (!asset.name.toLowerCase().endsWith('.gguf')) throw new Error('MODEL_EXTENSION_INVALID');

  const source = new File(asset.uri);
  if (!source.exists || !source.size) throw new Error('MODEL_SOURCE_INVALID');

  // The picker already creates a cache copy, so leave enough space for the private model copy too.
  if (Paths.availableDiskSpace < source.size * 1.1) throw new Error('MODEL_INSUFFICIENT_STORAGE');

  const modelDir = new Directory(Paths.document, 'models');
  if (!modelDir.exists) modelDir.create({ intermediates: true, idempotent: true });

  const destination = new File(modelDir, sanitizeName(asset.name));
  if (destination.exists) destination.delete();

  // Use the asynchronous legacy copy API for multi-gigabyte GGUF files so the JS thread is not blocked.
  await LegacyFileSystem.copyAsync({ from: source.uri, to: destination.uri });

  const copied = new File(destination.uri);
  if (!copied.exists || !copied.size) throw new Error('MODEL_COPY_VERIFICATION_FAILED');
  if (copied.size !== source.size) throw new Error('MODEL_COPY_SIZE_MISMATCH');

  return {
    path: copied.uri,
    name: copied.name,
    size: copied.size,
  };
}

export function removeImportedModel(path: string): void {
  const file = new File(path);
  if (file.exists) file.delete();
}

export async function downloadRecommendedModel(
  onProgress?: (progress: number) => void,
): Promise<ImportedModel> {
  assertNetworkAllowed();
  // Keep comfortable headroom for the model plus temporary/network overhead.
  if (Paths.availableDiskSpace < RECOMMENDED_MODEL.approximateBytes * 1.35) {
    throw new Error('MODEL_INSUFFICIENT_STORAGE');
  }

  const modelDir = new Directory(Paths.document, 'models');
  if (!modelDir.exists) modelDir.create({ intermediates: true, idempotent: true });

  const destination = new File(modelDir, RECOMMENDED_MODEL.name);
  if (destination.exists && (destination.size ?? 0) >= RECOMMENDED_MODEL.minBytes) {
    return { path: destination.uri, name: destination.name, size: destination.size! };
  }
  const partial = new File(modelDir, `${RECOMMENDED_MODEL.name}.part`);
  const task = LegacyFileSystem.createDownloadResumable(
    RECOMMENDED_MODEL.url,
    partial.uri,
    {},
    (progress) => {
      if (!onProgress) return;
      const expected = progress.totalBytesExpectedToWrite;
      if (expected > 0) {
        onProgress(Math.max(0, Math.min(1, progress.totalBytesWritten / expected)));
      }
    },
  );

  const unsubscribe = subscribeNetworkPolicy(() => {
    if (isLocalOnly()) void task.pauseAsync().catch(() => undefined);
  });
  let result;
  try { result = await task.downloadAsync(); assertNetworkAllowed(); }
  finally { unsubscribe(); }
  if (!result?.uri) throw new Error('MODEL_DOWNLOAD_CANCELLED');

  const downloaded = new File(result.uri);
  if (!downloaded.exists || !downloaded.size) throw new Error('MODEL_DOWNLOAD_VERIFICATION_FAILED');

  // Catch obvious HTML/error bodies or truncated transfers before handing the file to llama.cpp.
  if (downloaded.size < RECOMMENDED_MODEL.minBytes) {
    downloaded.delete();
    throw new Error('MODEL_DOWNLOAD_SIZE_INVALID');
  }

  if (destination.exists) destination.delete();
  downloaded.move(destination);
  onProgress?.(1);
  return {
    path: downloaded.uri,
    name: downloaded.name,
    size: downloaded.size,
  };
}

