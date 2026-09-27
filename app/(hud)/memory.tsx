import { useState } from 'react';
import { AppText, Button, Card, Field, Row, Screen, Title } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import { deleteMemory, upsertMemory } from '@/lib/storage/database';

export default function MemoryScreen() {
  const jarvis = useJarvis();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  return (
    <Screen>
      <Title>Memory</Title>
      <AppText muted>Only approved records are eligible for prompt context.</AppText>

      <Card title="Add memory">
        <Field value={title} onChangeText={setTitle} placeholder="Title" />
        <Field value={body} onChangeText={setBody} placeholder="What should JARVIS remember?" multiline />
        <Button title="Save approved memory" disabled={!body.trim()} onPress={() => void (async () => {
          await jarvis.saveMemory(title || 'Memory', body);
          setTitle('');
          setBody('');
        })()} />
      </Card>

      {jarvis.memories.map((memory) => (
        <Card key={memory.id} title={`${memory.pinned ? 'Pinned · ' : ''}${memory.type}`}>
          <AppText>{memory.title}</AppText>
          <AppText muted>{memory.body}</AppText>
          <Row>
            <Button title={memory.pinned ? 'Unpin' : 'Pin'} onPress={() => void (async () => {
              await upsertMemory({ ...memory, pinned: !memory.pinned, updatedAt: Date.now() });
              await jarvis.refresh();
            })()} />
            <Button title={memory.approved ? 'Disable' : 'Approve'} onPress={() => void (async () => {
              await upsertMemory({ ...memory, approved: !memory.approved, updatedAt: Date.now() });
              await jarvis.refresh();
            })()} />
            <Button title="Delete" danger onPress={() => void (async () => {
              await deleteMemory(memory.id);
              await jarvis.refresh();
            })()} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
