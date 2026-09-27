import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('../plugins/withFastAndroidBuild.js') as {
  ROG_RNLLAMA_VARIANTS: string;
  GRADLE_PROPERTIES: Record<string, string>;
};

const loader = readFileSync(
  resolve(process.cwd(), 'node_modules/llama.rn/android/src/main/java/com/rnllama/RNLlama.java'),
  'utf8',
);
const cmake = readFileSync(resolve(process.cwd(), 'node_modules/llama.rn/android/src/main/CMakeLists.txt'), 'utf8');

describe('EAS build stays inside the 45-minute limit', () => {
  const kept = plugin.ROG_RNLLAMA_VARIANTS.split(',');

  it('builds far fewer llama.rn bridges than the seven that ran out the clock', () => {
    // b9c88cb: 19.1 min of a 37.0 min Gradle run was llama.rn compiling seven
    // JNI bridges. Seven cancelled builds died at 45 min doing the same.
    expect(kept.length).toBeLessThanOrEqual(3);
  });

  it('only names variants llama.rn actually knows how to build', () => {
    for (const variant of kept) {
      expect(cmake, variant).toContain(`"${variant}"`);
    }
  });

  it('keeps the exact chain the loader walks on a Snapdragon 8 Gen 3', () => {
    // The loader tries these in this order on a dotprod+i8mm core. If the
    // first one is dropped the ROG silently loses GPU/DSP acceleration; if the
    // generic one is dropped a failed load has nowhere left to fall back to.
    const primary = 'rnllama_v8_2_dotprod_i8mm_hexagon_opencl';
    const cpuFallback = 'rnllama_v8_2_dotprod_i8mm';
    expect(kept).toContain(primary);
    expect(kept).toContain(cpuFallback);
    expect(kept).toContain('rnllama');

    expect(loader.indexOf(`"rnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl"`)).toBeGreaterThan(-1);
    expect(loader.indexOf(`"rnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl"`)).toBeLessThan(
      loader.indexOf(`"rnllama_jni_v8_2_dotprod_i8mm"`),
    );
    expect(loader).toContain('System.loadLibrary("rnllama_jni")');
  });

  it('pins the ABI so a build that forgets the flag cannot fall back to four', () => {
    // The seven cancelled builds had no -PreactNativeArchitectures flag and
    // compiled armeabi-v7a, x86 and x86_64 as well.
    expect(plugin.GRADLE_PROPERTIES.reactNativeArchitectures).toBe('arm64-v8a');
  });

  it('is registered in the app config, so prebuild actually applies it', () => {
    const appConfig = readFileSync(resolve(process.cwd(), 'app.config.ts'), 'utf8');
    expect(appConfig).toContain('./plugins/withFastAndroidBuild');
  });
});
