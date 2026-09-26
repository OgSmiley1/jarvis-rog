import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { JarvisOrb, type OrbState } from './JarvisOrb';
import { colors } from './theme';
import { setLiveCapture } from '@/lib/vision/liveCapture';

/**
 * The second page from the reference video: the live camera full-bleed with
 * JARVIS as a small orb in the corner. The preview runs only while this page
 * is on screen and the app is in front; nothing is recorded. When the owner
 * asks "what do you see" here, the one photo is taken from this live view.
 */
export function CameraPage({
  state,
  level,
  onOrbPress,
  arabic,
}: {
  state: OrbState;
  level: number;
  onOrbPress: () => void;
  arabic: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [ready, setReady] = useState(false);
  const camera = useRef<CameraView>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setForeground(next === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const live = Boolean(permission?.granted) && foreground;

  // Only a running, visible preview may be used for "what do you see".
  useEffect(() => {
    if (!live || !ready) return;
    return setLiveCapture(async () => {
      const photo = await camera.current?.takePictureAsync({ quality: 0.5, exif: false, shutterSound: false });
      return photo?.uri ?? null;
    });
  }, [live, ready]);

  useEffect(() => {
    if (!live) setReady(false);
  }, [live]);

  return (
    <View style={styles.page}>
      {live ? (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} active={live} onCameraReady={() => setReady(true)} />
      ) : (
        <View style={styles.blocked}>
          <Text style={styles.blockedText}>
            {permission && !permission.granted
              ? arabic
                ? 'أحتاج إذن الكاميرا لأرى. اضغط للسماح.'
                : 'I need camera permission to see. Tap to allow.'
              : arabic
                ? 'الكاميرا متوقفة.'
                : 'Camera paused.'}
          </Text>
          {permission && !permission.granted ? (
            <Pressable onPress={() => void requestPermission()} style={styles.allow} accessibilityRole="button">
              <Text style={styles.allowText}>{arabic ? 'السماح' : 'Allow camera'}</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.liveBadge}>
          <View style={[styles.dot, { backgroundColor: live ? colors.bad : colors.muted }]} />
          <Text style={styles.liveText}>{live ? (arabic ? 'الكاميرا مباشرة · لا تسجيل' : 'CAMERA LIVE · NOT RECORDING') : arabic ? 'متوقفة' : 'PAUSED'}</Text>
        </View>
        {live ? (
          <Pressable
            onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
            style={styles.flip}
            accessibilityRole="button"
            accessibilityLabel={arabic ? 'قلب الكاميرا' : 'Flip camera'}
          >
            <Text style={styles.flipText}>⟲</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.corner}>
        <JarvisOrb state={state} level={level} onPress={onOrbPress} size={112} compact />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, borderRadius: 20, overflow: 'hidden', marginHorizontal: 12, backgroundColor: '#05070B' },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  blockedText: { color: colors.text, fontSize: 15, textAlign: 'center' },
  allow: { borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18 },
  allowText: { color: colors.accent, fontWeight: '700' },
  topRow: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(5,7,11,0.6)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: '#F2F6FA', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  flip: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(5,7,11,0.6)', alignItems: 'center', justifyContent: 'center' },
  flipText: { color: '#F2F6FA', fontSize: 20 },
  corner: { position: 'absolute', right: 6, bottom: 6 },
});
