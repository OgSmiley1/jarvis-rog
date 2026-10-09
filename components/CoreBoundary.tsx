import { runtimeObservations } from '@/lib/diagnostics/runtime';
import { Component, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import { recordLive } from '@/lib/telemetry/liveLog';
export class CoreBoundary extends Component<PropsWithChildren<{ onPress: () => void }>, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { runtimeObservations.rendererError = true; recordLive('error', 'Core renderer unavailable', { raw: error.message }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <View style={{ alignItems: 'center', padding: 24 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Talk or stop" onPress={this.props.onPress} style={{ borderRadius: 100, borderWidth: 3, borderColor: '#55ddd0', padding: 48 }}>
        <Text style={{ color: '#ffffff' }}>JARVIS</Text>
      </Pressable>
      <Text style={{ color: '#ffffff' }}>Animation unavailable. Voice and tools remain accessible.</Text>
    </View>;
  }
}
