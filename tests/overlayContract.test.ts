import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The floating orb is native Kotlin that no environment here can compile.
 * These are the mistakes that would still build fine and only fail on the
 * owner's phone — a service the manifest names but no class implements, a
 * missing permission, a JS lookup for a module name that does not exist.
 */
const root = resolve(process.cwd(), 'modules/expo-jarvis-overlay');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const kotlin = (file: string) => read(`android/src/main/java/expo/modules/jarvisoverlay/${file}`);

const manifest = read('android/src/main/AndroidManifest.xml');
const moduleConfig = JSON.parse(read('expo-module.config.json')) as { android: { modules: string[] } };
const moduleKt = kotlin('ExpoJarvisOverlayModule.kt');
const serviceKt = kotlin('JarvisOverlayService.kt');
const wrapper = readFileSync(resolve(process.cwd(), 'lib/device/overlay.ts'), 'utf8');

describe('floating orb native contract', () => {
  it('declares a service the Kotlin actually implements', () => {
    expect(manifest).toContain('android:name="expo.modules.jarvisoverlay.JarvisOverlayService"');
    expect(serviceKt).toContain('package expo.modules.jarvisoverlay');
    expect(serviceKt).toMatch(/class JarvisOverlayService\s*:\s*Service\(\)/);
  });

  it('registers the module class autolinking will look for', () => {
    expect(moduleConfig.android.modules).toEqual(['expo.modules.jarvisoverlay.ExpoJarvisOverlayModule']);
    expect(moduleKt).toMatch(/class ExpoJarvisOverlayModule\s*:\s*Module\(\)/);
  });

  it('uses the same module name on both sides of the bridge', () => {
    expect(moduleKt).toContain('Name("ExpoJarvisOverlay")');
    expect(wrapper).toContain("requireOptionalNativeModule<ExpoJarvisOverlayNativeModule>('ExpoJarvisOverlay')");
  });

  it('exposes every function the JS wrapper calls', () => {
    for (const fn of ['canDrawOverlays', 'openOverlaySettings', 'show', 'hide', 'isShowing']) {
      expect(moduleKt, fn).toContain(`Function("${fn}")`);
      expect(wrapper, fn).toContain(`${fn}()`);
    }
  });

  it('holds every permission the orb needs on Android 14+', () => {
    for (const permission of [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
    ]) {
      expect(manifest, permission).toContain(`android:name="${permission}"`);
    }
  });

  it('declares the foreground service type in both places Android checks', () => {
    // Android 14 throws MissingForegroundServiceTypeException if the manifest
    // type and the startForeground() type disagree or either is missing.
    expect(manifest).toContain('android:foregroundServiceType="specialUse"');
    expect(manifest).toContain('android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE');
    expect(serviceKt).toContain('ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE');
  });

  it('never adds the overlay window without the permission', () => {
    expect(serviceKt).toContain('Settings.canDrawOverlays(this)');
    expect(moduleKt).toContain('if (!canDraw(context)) return@Function false');
  });

  it('keeps the orb from stealing focus or input from the app underneath', () => {
    expect(serviceKt).toContain('FLAG_NOT_FOCUSABLE');
  });

  it('is autolinked from ./modules without touching the lockfile', () => {
    // Adding it to package.json would change pnpm-lock.yaml and bust the EAS
    // compile cache — the exact thing that pushed builds into the 45-minute wall.
    const pkg = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
    expect(pkg).not.toContain('expo-jarvis-overlay');
  });
});
