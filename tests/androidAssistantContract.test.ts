import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Android assistant native contract', () => {
  it('protects all assistant services with the real BIND_VOICE_INTERACTION permission', () => {
    const plugin = read('plugins/withJarvisAssistant.js');

    expect(plugin).toContain("android.permission.BIND_VOICE_INTERACTION");
    expect(plugin).not.toContain('BIND_SPEECH_RECOGNITION_SERVICE');
  });

  it('keeps the framework-required RecognitionService side-effect free', () => {
    const source = read('plugins/android-assistant/JarvisRecognitionService.java');

    expect(source).toContain('SpeechRecognizer.ERROR_CLIENT');
    expect(source).not.toContain('startActivity(');
  });

  it('connects the voice interaction metadata to the recognition stub', () => {
    const xml = read('plugins/android-assistant/jarvis_voice_interaction_service.xml');

    expect(xml).toContain('JarvisVoiceInteractionSessionService');
    expect(xml).toContain('JarvisRecognitionService');
    expect(xml).toContain('android:supportsAssist="true"');
  });
});
