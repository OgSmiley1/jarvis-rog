import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, StyleSheet, View, type Permission } from 'react-native';
import { AppText, Button, Card } from '@/components/Ui';
import { isPhoneAccessSupported, phone } from '@/lib/device/phone';

interface Access {
  permission: Permission;
  title: string;
  says: string;
  /** Android 13+ blocks these for apps not installed from a store until the owner allows restricted settings. */
  restricted?: boolean;
}

const ACCESS: Access[] = [
  { permission: 'android.permission.READ_CONTACTS', title: 'Contacts', says: '"Call Mom", "text Ahmed saying I\'m late"' },
  { permission: 'android.permission.READ_SMS', title: 'Messages', says: '"Read my messages"', restricted: true },
  { permission: 'android.permission.READ_CALL_LOG', title: 'Call log', says: '"Who called me", "any missed calls"', restricted: true },
  { permission: 'android.permission.READ_CALENDAR', title: 'Calendar', says: '"What do I have tomorrow"' },
];

/**
 * The phone's own data, one switch per kind, like a connectors screen. What
 * JARVIS reads is spoken to the owner only: it is kept out of the live test
 * log and out of what is sent to a cloud brain.
 */
export function PhoneAccessCard() {
  const [granted, setGranted] = useState<Record<string, boolean>>({});

  const reread = useCallback(() => {
    if (!isPhoneAccessSupported()) return;
    setGranted(Object.fromEntries(ACCESS.map((access) => [access.permission, phone().hasPermission(access.permission)])));
  }, []);

  useEffect(() => {
    reread();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reread();
    });
    return () => subscription.remove();
  }, [reread]);

  async function allow(access: Access) {
    const result = await PermissionsAndroid.request(access.permission);
    // Android answers "never ask again" at once when the permission is
    // blocked, including the restricted-settings case; only its own app
    // settings screen can unblock it.
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) await Linking.openSettings();
    reread();
  }

  if (!isPhoneAccessSupported()) {
    return (
      <Card title="Phone access">
        <AppText muted>This build does not include phone access. Install a newer JARVIS APK to use it.</AppText>
      </Card>
    );
  }

  return (
    <Card title="Phone access">
      <AppText muted>
        What JARVIS may read and do on this phone. Anything it reads is spoken to you only, never posted to the live test
        log or sent to a cloud brain. Texts are filled in for you; you press Send.
      </AppText>
      {ACCESS.map((access) => (
        <View key={access.permission} style={styles.row}>
          <View style={styles.text}>
            <AppText>{access.title}</AppText>
            <AppText muted>{access.says}</AppText>
          </View>
          {granted[access.permission] ? (
            <AppText>Allowed</AppText>
          ) : (
            <Button title="Allow" onPress={() => void allow(access)} />
          )}
        </View>
      ))}
      <AppText muted>
        If Messages or Call log opens Android settings instead of asking: tap ⋮ (top right) → Allow restricted settings, then
        Permissions. The Termux setup script grants all of these in one go.
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  text: { flex: 1, gap: 2 },
});
