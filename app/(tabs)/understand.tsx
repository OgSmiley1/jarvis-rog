import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, Field, Row, Screen, Title } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import type { UnderstandMode } from '@/lib/understand/communicationIntelligence';
import { buildUnderstandPrompt, parseStructuredUnderstanding } from '@/lib/understand/communicationIntelligence';
import { errorMessage } from '@/lib/utils/errors';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function UnderstandScreen() {
  const jarvis = useJarvis();
  const params = useLocalSearchParams<{ mode?: string | string[]; source?: string | string[] }>();
  const hydratedParams = useRef(false);
  const [source, setSource] = useState('');
  const [mode, setMode] = useState<UnderstandMode>('analyse');
  const [output, setOutput] = useState('');
  const [rawFallback, setRawFallback] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hydratedParams.current) return;
    const requestedMode = firstParam(params.mode);
    const requestedSource = firstParam(params.source);
    if (requestedMode === 'analyse' || requestedMode === 'draft' || requestedMode === 'plan') setMode(requestedMode);
    if (requestedSource) setSource(requestedSource);
    hydratedParams.current = true;
  }, [params.mode, params.source]);

  async function run() {
    if (!source.trim()) return;
    setBusy(true);
    setOutput('');
    setRawFallback(false);
    try {
      const generated = await jarvis.ask(buildUnderstandPrompt(mode, source), 'deep');
      try {
        const parsed = parseStructuredUnderstanding(generated.text);
        setOutput([
          `Situation: ${parsed.situation}`,
          `Objective: ${parsed.objective}`,
          `Facts: ${parsed.facts.join(' | ') || 'None stated'}`,
          `Risks: ${parsed.risks.join(' | ') || 'None stated'}`,
          `Missing: ${parsed.missingInformation.join(' | ') || 'None stated'}`,
          `Questions: ${parsed.questions.join(' | ') || 'None stated'}`,
          `Actions: ${parsed.actions.join(' | ') || 'None stated'}`,
          `Draft: ${parsed.draftReply || 'None'}`,
        ].join('\n\n'));
      } catch {
        // Do not discard a useful local-model answer solely because its formatting missed a heading.
        setOutput(generated.text);
        setRawFallback(true);
      }
    } catch (error) {
      Alert.alert('Understand failed', errorMessage(error, 'UNDERSTAND_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Understand</Title>
      <AppText muted>Processes only text you intentionally provide.</AppText>
      <Card title="Mode">
        <Row>
          {(['analyse', 'draft', 'plan'] as UnderstandMode[]).map((item) => (
            <Button key={item} title={item.toUpperCase()} onPress={() => setMode(item)} />
          ))}
        </Row>
      </Card>
      <Card title="Source text">
        <Field value={source} onChangeText={setSource} placeholder="Paste approved text…" multiline />
        <Button title={busy ? 'Analysing…' : `Run ${mode}`} disabled={busy || !source.trim()} onPress={() => void run()} />
      </Card>
      {output ? (
        <Card title={rawFallback ? 'Result · raw format' : 'Structured result'}>
          {rawFallback ? <AppText muted>The model returned useful text but missed the strict section format.</AppText> : null}
          <AppText>{output}</AppText>
          <Button title="Save to memory" onPress={() => void jarvis.saveMemory(`Understand · ${mode}`, output)} />
        </Card>
      ) : null}
    </Screen>
  );
}
