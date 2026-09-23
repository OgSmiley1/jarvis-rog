import { useState } from 'react';
import { AppText, Button, Card, Field, Screen, Title } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';

export default function ReflectScreen() {
  const jarvis = useJarvis();
  const [focus, setFocus] = useState('');
  const [observation, setObservation] = useState('');

  return (
    <Screen>
      <Title>Reflect</Title>
      <AppText muted>Manual reflection only. No passive phone activity monitoring.</AppText>
      <Card title="Reflection">
        <Field value={focus} onChangeText={setFocus} placeholder="Focus" />
        <Field value={observation} onChangeText={setObservation} placeholder="Observation" multiline />
        <Button
          title="Save reflection"
          disabled={!observation.trim()}
          onPress={() => void (async () => {
            await jarvis.saveMemory(focus || 'Reflection', observation);
            setFocus('');
            setObservation('');
          })()}
        />
      </Card>
    </Screen>
  );
}
