import { describe, expect, it } from 'vitest';
import { prosodyFor, rankVoices, scoreVoice, selectVoice, type DeviceVoice } from '@/lib/voice/voiceCatalog';

/** A realistic snapshot of what an Android phone with Google TTS enumerates. */
const voice = (identifier: string, name: string, language: string, quality = 'Default'): DeviceVoice => ({
  identifier,
  name,
  language,
  quality,
});

const DEVICE: DeviceVoice[] = [
  voice('en-GB-language', 'en-GB-language', 'en-GB'),
  voice('en-gb-x-gbb-local', 'English (UK) 2', 'en-GB'),
  voice('en-gb-x-rjs-network', 'English (UK) 4', 'en-GB'),
  voice('en-us-x-iom-local', 'English (US) 1', 'en-US'),
  voice('ar-xa-x-arc-local', 'Arabic 3', 'ar-XA'),
  voice('ar-xa-x-ard-network', 'Arabic 4', 'ar-XA'),
  voice('espeak-en', 'eSpeak English', 'en-GB'),
];

describe('voice selection', () => {
  it('prefers a neural voice over the bare platform voice', () => {
    const chosen = selectVoice(DEVICE, { language: 'en' });
    expect(chosen?.voice.identifier).toBe('en-gb-x-gbb-local');
  });

  it('never chooses the legacy formant engine when anything else exists', () => {
    const chosen = selectVoice(DEVICE, { language: 'en' });
    expect(chosen?.voice.identifier).not.toBe('espeak-en');

    const espeak = scoreVoice(voice('espeak-en', 'eSpeak English', 'en-GB'), { language: 'en' });
    expect(espeak.score).toBeLessThan(0);
    expect(espeak.reason).toContain('legacy formant engine');
  });

  it('keeps network voices out of the way when offline-first', () => {
    const ranked = rankVoices(DEVICE, { language: 'en' });
    const local = ranked.findIndex((entry) => entry.voice.identifier === 'en-gb-x-gbb-local');
    const network = ranked.findIndex((entry) => entry.voice.identifier === 'en-gb-x-rjs-network');
    expect(local).toBeLessThan(network);
  });

  it('promotes the network voice once the owner allows it', () => {
    const chosen = selectVoice(DEVICE, { language: 'en', allowNetwork: true });
    expect(chosen?.voice.identifier).toBe('en-gb-x-rjs-network');
    expect(chosen?.reason).toContain('server-synthesised');
  });

  it('prefers en-GB over en-US for the same tier', () => {
    const ranked = rankVoices(DEVICE, { language: 'en' });
    const gb = ranked.findIndex((entry) => entry.voice.identifier === 'en-gb-x-gbb-local');
    const us = ranked.findIndex((entry) => entry.voice.identifier === 'en-us-x-iom-local');
    expect(gb).toBeLessThan(us);
  });

  it('selects an Arabic voice for Arabic and never an English one', () => {
    const chosen = selectVoice(DEVICE, { language: 'ar' });
    expect(chosen?.voice.identifier).toBe('ar-xa-x-arc-local');
    expect(rankVoices(DEVICE, { language: 'ar' }).every((entry) => entry.voice.language.startsWith('ar'))).toBe(true);
  });

  it('honours a voice the owner pinned', () => {
    const chosen = selectVoice(DEVICE, { language: 'en', preferredIdentifier: 'en-us-x-iom-local' });
    expect(chosen?.voice.identifier).toBe('en-us-x-iom-local');
    expect(chosen?.reason).toContain('pinned');
  });

  it('falls back to ranking when a pinned voice is no longer installed', () => {
    const chosen = selectVoice(DEVICE, { language: 'en', preferredIdentifier: 'en-gb-x-removed-local' });
    expect(chosen?.voice.identifier).toBe('en-gb-x-gbb-local');
  });

  it('returns nothing when the device has no voice for the language', () => {
    expect(selectVoice([voice('fr-fr-x-frb-local', 'French', 'fr-FR')], { language: 'ar' })).toBeUndefined();
  });

  it('ranks stably, so the voice does not change between launches', () => {
    const forwards = rankVoices(DEVICE, { language: 'en' }).map((entry) => entry.voice.identifier);
    const backwards = rankVoices([...DEVICE].reverse(), { language: 'en' }).map((entry) => entry.voice.identifier);
    expect(forwards).toEqual(backwards);
  });

  it('slows the legacy engine down and leaves a neural voice near natural pace', () => {
    const legacy = prosodyFor(voice('en-GB-language', 'en-GB-language', 'en-GB'), 'en');
    const neural = prosodyFor(voice('en-gb-x-gbb-local', 'English (UK) 2', 'en-GB'), 'en');
    expect(legacy.rate).toBeLessThan(neural.rate);
    // Arabic keeps natural pitch: lowering it muddies the emphatic consonants.
    expect(prosodyFor(voice('ar-xa-x-arc-local', 'Arabic 3', 'ar-XA'), 'ar').pitch).toBe(1.0);
  });

  it('treats an enhanced-quality report as a bonus, not the only signal', () => {
    const enhancedBasic = scoreVoice(voice('en-GB-language', 'basic', 'en-GB', 'Enhanced'), { language: 'en' });
    const defaultNeural = scoreVoice(voice('en-gb-x-gbb-local', 'neural', 'en-GB'), { language: 'en' });
    // Android reports Default for most good voices, so the identifier shape
    // has to outweigh the quality flag or the old selection bug returns.
    expect(defaultNeural.score).toBeGreaterThan(enhancedBasic.score);
  });
});
