import { Stack } from 'expo-router';
import { colors } from '@/components/theme';

/**
 * JARVIS has one screen: the ambient HUD.
 *
 * The eight-tab bar is gone. Every workspace that used to be a tab (Chat,
 * AI Hub, Projects, Memory, Understand, Reflect, Settings) is still here and
 * still reachable, but as a sheet pushed from the HUD drawer rather than as a
 * permanent row of navigation the owner has to think about. Nothing was
 * deleted; the routes are unchanged, so `/understand`, `/settings?section=…`
 * and the deterministic slash routing in chat.tsx keep working.
 */
export default function HudLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="chat" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="online" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="projects" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="memory" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="understand" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="reflect" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
