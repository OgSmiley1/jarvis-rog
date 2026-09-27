import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Switch, View } from 'react-native';
import { AppText, Button, Card } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import {
  canDrawOverlays,
  hideFloatingOrb,
  isFloatingOrbShowing,
  isOverlaySupported,
  openOverlaySettings,
  showFloatingOrb,
} from '@/lib/device/overlay';

/**
 * Settings for the orb that floats over other apps.
 *
 * Granting "Display over other apps" happens in Android's own settings, so the
 * owner leaves JARVIS and comes back. The status is re-read every time the app
 * returns to the foreground, so the card reports the permission as it is now,
 * not as it was when the screen first rendered.
 */
export function FloatingOrbCard() {
  const jarvis = useJarvis();
  const [permitted, setPermitted] = useState(canDrawOverlays());
  const [showing, setShowing] = useState(isFloatingOrbShowing());

  const reread = useCallback(() => {
    setPermitted(canDrawOverlays());
    setShowing(isFloatingOrbShowing());
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reread();
    });
    return () => subscription.remove();
  }, [reread]);

  async function toggle(enabled: boolean) {
    await jarvis.updateSettings({ floatingOrbEnabled: enabled });
    if (enabled) {
      if (!showFloatingOrb()) openOverlaySettings();
    } else {
      hideFloatingOrb();
    }
    // The service attaches the orb asynchronously; read the result a moment later.
    setTimeout(reread, 400);
  }

  if (!isOverlaySupported()) {
    return (
      <Card title="Floating orb">
        <AppText muted>This build does not include the floating orb. Install a newer JARVIS APK to use it.</AppText>
      </Card>
    );
  }

  return (
    <Card title="Floating orb">
      <View style={styles.row}>
        <AppText>Keep the JARVIS orb over other apps</AppText>
        <Switch value={jarvis.settings.floatingOrbEnabled} onValueChange={(value) => void toggle(value)} />
      </View>
      <AppText muted>
        A small orb stays on screen over games, maps and every other app. Tap it to open JARVIS; drag it to move it, and it
        snaps to the nearest edge. A notification shows while it is on, with a Hide button to remove it.
      </AppText>
      <AppText muted>
        Permission: {permitted ? 'granted' : 'not granted yet'} · Orb: {showing ? 'on screen' : 'hidden'}
      </AppText>
      {!permitted ? (
        <Button title="Allow “Display over other apps”" onPress={() => openOverlaySettings()} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
