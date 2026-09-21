import { initExecutorch } from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';

// Register before useSpeechToText mounts. ExecuTorch 0.9 has no default
// filesystem adapter; without this, Whisper/VAD fail before loading a model.
initExecutorch({ resourceFetcher: ExpoResourceFetcher });
