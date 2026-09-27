import { requireOptionalNativeModule } from 'expo';

/**
 * The floating orb drawn over other apps. See modules/expo-jarvis-overlay.
 *
 * `requireOptionalNativeModule` returns null rather than throwing when the
 * native module is not linked — web, or an APK built before this module
 * existed. Every function degrades to "unavailable" in that case, so an old
 * build never crashes on a control it cannot honour.
 */
interface ExpoJarvisOverlayNativeModule {
  canDrawOverlays(): boolean;
  openOverlaySettings(): boolean;
  show(): boolean;
  hide(): boolean;
  isShowing(): boolean;
}

const native = requireOptionalNativeModule<ExpoJarvisOverlayNativeModule>('ExpoJarvisOverlay');

/** The native module is present in this build. */
export function isOverlaySupported(): boolean {
  return native !== null;
}

/** The owner has granted "Display over other apps" to JARVIS. */
export function canDrawOverlays(): boolean {
  return native?.canDrawOverlays() ?? false;
}

/** Opens Android's own screen for granting the permission. Apps cannot grant it to themselves. */
export function openOverlaySettings(): void {
  native?.openOverlaySettings();
}

/**
 * Shows the orb. Returns false — and shows nothing — when the permission is
 * missing, rather than starting a service that would fail immediately.
 */
export function showFloatingOrb(): boolean {
  return native?.show() ?? false;
}

export function hideFloatingOrb(): void {
  native?.hide();
}

export function isFloatingOrbShowing(): boolean {
  return native?.isShowing() ?? false;
}
