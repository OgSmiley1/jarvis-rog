import { describe, expect, it } from 'vitest';
import { collectUrls, libraryCacheName, localizeConfig, voiceFileName } from '@/lib/voice/voiceFiles';

const WHISPER = 'https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny/resolve/v0.9.0/xnnpack/whisper_tiny_xnnpack_fp32.pte';
const TOKENIZER = 'https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny/resolve/v0.9.0/tokenizer.json';
const LEXICON = 'https://huggingface.co/software-mansion/react-native-executorch-kokoro/resolve/v0.9.0/phonemizer/en-gb/lexicon.json';

// The shape of the library's own configs (whisper_tiny() and kokoro.en_gb.daniel()).
const stt = { modelName: 'whisper-tiny', isMultilingual: true, modelSource: WHISPER, tokenizerSource: TOKENIZER };
const tts = {
  model: { modelName: 'kokoro', durationPredictorSource: 'https://huggingface.co/software-mansion/react-native-executorch-kokoro/resolve/v0.9.0/xnnpack/standard/duration_predictor_std.pte' },
  voiceSource: 'https://huggingface.co/software-mansion/react-native-executorch-kokoro/resolve/v0.9.0/voices/bm_daniel.bin',
  phonemizerConfig: { lang: 'en-gb', lexiconSource: LEXICON },
};

describe('voice files live in the permanent folder', () => {
  it('names each file by model, version and path', () => {
    expect(voiceFileName(WHISPER)).toBe('voice/whisper-tiny/v0.9.0/xnnpack/whisper_tiny_xnnpack_fp32.pte');
    expect(voiceFileName(TOKENIZER)).toBe('voice/whisper-tiny/v0.9.0/tokenizer.json');
    expect(voiceFileName(LEXICON)).toBe('voice/kokoro/v0.9.0/phonemizer/en-gb/lexicon.json');
  });

  it('two tokenizer.json files from different models never collide', () => {
    const other = TOKENIZER.replace('whisper-tiny', 'whisper-base');
    expect(voiceFileName(other)).not.toBe(voiceFileName(TOKENIZER));
  });

  it('finds every URL, however deep, and nothing else', () => {
    expect(collectUrls(stt)).toEqual([WHISPER, TOKENIZER]);
    expect(collectUrls(tts)).toHaveLength(3);
    expect(collectUrls(tts)).not.toContain('en-gb');
  });

  it('swaps URLs for local files and keeps every other field', () => {
    const local = localizeConfig(tts, (url) => `file:///storage/emulated/0/Download/JARVIS/models/${voiceFileName(url)}`);
    expect(local.phonemizerConfig.lang).toBe('en-gb');
    expect(local.model.modelName).toBe('kokoro');
    expect(local.voiceSource).toBe('file:///storage/emulated/0/Download/JARVIS/models/voice/kokoro/v0.9.0/voices/bm_daniel.bin');
    expect(collectUrls(local)).toEqual([]);
    // The original config is untouched.
    expect(tts.voiceSource.startsWith('https://')).toBe(true);
  });

  it('knows the name the library used in its own cache, so old downloads are reused', () => {
    expect(libraryCacheName(WHISPER)).toBe('whisper_tiny_xnnpack_fp32.pte');
  });
});
