import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

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
