import { Alert, Linking } from 'react-native';
import { isLocalOnly } from './localOnly';
/** Also guard owner-invoked external browser links from settings/hub cards. */
export async function openOnlineUrl(url: string): Promise<void> {
  if (isLocalOnly()) { Alert.alert('Local Only', 'Internet links are blocked while Local Only is on.'); return; }
  try { await Linking.openURL(url); }
  catch { Alert.alert('Link unavailable', 'Android could not open this link.'); }
}
