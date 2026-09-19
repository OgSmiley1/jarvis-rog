import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0A0F13', borderTopColor: '#20313D', height: 68, paddingBottom: 8 },
        tabBarActiveTintColor: '#66E3FF',
        tabBarInactiveTintColor: '#7F939E',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Coach' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="online" options={{ title: 'AI Hub' }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects' }} />
      <Tabs.Screen name="memory" options={{ title: 'Memory' }} />
      <Tabs.Screen name="understand" options={{ title: 'Understand' }} />
      <Tabs.Screen name="reflect" options={{ title: 'Reflect' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
