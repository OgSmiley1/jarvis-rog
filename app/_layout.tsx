import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { JarvisProvider } from '@/context/JarvisContext';
import { BootstrapGate } from '@/components/BootstrapGate';

export default function RootLayout() {
  return (
    <JarvisProvider>
      <StatusBar style="light" />
      <BootstrapGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#070A0D' } }} />
      </BootstrapGate>
    </JarvisProvider>
  );
}
