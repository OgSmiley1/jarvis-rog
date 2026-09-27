import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = readFileSync(resolve(process.cwd(), 'scripts/install-fixed-on-phone.sh'), 'utf8');

describe('phone-only build and install contract', () => {
  it('starts an EAS build rather than only downloading one', () => {
    // The script's whole purpose is to be able to produce an APK from the
    // phone. It previously could only fetch an existing build, so with no
    // build in the account it had nothing to do and always failed.
    expect(script).toMatch(/eas build\b|\$EAS build \\/);
    expect(script).toContain('--profile preview');
    expect(script).toContain('--wait');
  });

  it('builds the commit that is checked out, not a hardcoded one', () => {
    expect(script).toContain('git rev-parse HEAD');
    // A pinned validation commit would silently install stale code.
    expect(script).not.toMatch(/^VALIDATION_COMMIT=/m);
  });

  it('refuses an APK that would launch without local inference', () => {
    expect(script).toContain('librnllama');
    expect(script).toContain('assets/index.android.bundle');
    expect(script).toContain('arm64-v8a');
  });

  it('requires the exact engine bridges the Snapdragon 8 Gen 3 loads', () => {
    // withFastAndroidBuild narrows the JNI bridges; if the primary or the
    // generic fallback went missing, the APK would install and the brain
    // would silently fail to load.
    expect(script).toContain('librnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl.so');
    expect(script).toContain("'lib/arm64-v8a/librnllama_jni.so'");
  });

  it('explains the account-access failure instead of reporting a build error', () => {
    expect(script).toMatch(/account not found/i);
    // `$EAS` expands to the pinned eas-cli invocation at runtime.
    expect(script).toContain('init --force');
  });
});
