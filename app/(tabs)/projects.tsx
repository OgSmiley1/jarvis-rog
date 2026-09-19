import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { AppText, Button, Card, Field, Row, Screen, Title } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import { deleteProject, listProjectSteps } from '@/lib/storage/database';
import type { ProjectStep } from '@/lib/storage/types';

export default function ProjectsScreen() {
  const jarvis = useJarvis();
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [stepText, setStepText] = useState('');
  const [steps, setSteps] = useState<ProjectStep[]>([]);

  async function refreshSteps() {
    if (!jarvis.activeProject) {
      setSteps([]);
      return;
    }
    setSteps(await listProjectSteps(jarvis.activeProject.id));
  }

  useEffect(() => {
    void refreshSteps();
  }, [jarvis.activeProject?.id]);

  return (
    <Screen>
      <Title>Projects</Title>
      <AppText muted>Continuity: objective → completed → failed → pending → next action.</AppText>

      {jarvis.activeProject ? (
        <Card title="Active project">
          <AppText>{jarvis.activeProject.name}</AppText>
          <AppText muted>{jarvis.activeProject.objective}</AppText>
          <AppText>Last completed: {jarvis.activeProject.lastCompletedStep ?? 'Nothing yet'}</AppText>
          <AppText>Next action: {jarvis.activeProject.nextAction ?? 'Define the next step'}</AppText>
          <Row>
            <Button title="Pause project" onPress={() => void jarvis.setProjectStatus(jarvis.activeProject!.id, 'paused')} />
            <Button title="Complete project" onPress={() => void jarvis.setProjectStatus(jarvis.activeProject!.id, 'completed')} />
          </Row>

          {steps.map((step) => (
            <Card key={step.id} title={`${step.sequence}. ${step.status}`}>
              <AppText>{step.description}</AppText>
              {step.error ? <AppText muted>Error: {step.error}</AppText> : null}
              <Row>
                {step.status !== 'running' && step.status !== 'success' ? (
                  <Button title="Start" onPress={() => void jarvis.setProjectStepStatus(step.projectId, step.id, 'running').then(refreshSteps)} />
                ) : null}
                {step.status !== 'success' ? (
                  <Button title="Success" onPress={() => void jarvis.setProjectStepStatus(step.projectId, step.id, 'success').then(refreshSteps)} />
                ) : null}
                {step.status !== 'failed' ? (
                  <Button title="Failed" danger onPress={() => void jarvis.setProjectStepStatus(step.projectId, step.id, 'failed').then(refreshSteps)} />
                ) : null}
                {step.status === 'failed' ? (
                  <Button title="Retry" onPress={() => void jarvis.setProjectStepStatus(step.projectId, step.id, 'pending').then(refreshSteps)} />
                ) : null}
              </Row>
            </Card>
          ))}

          <Field value={stepText} onChangeText={setStepText} placeholder="Next project step" />
          <Button title="Add step" disabled={!stepText.trim()} onPress={() => void (async () => {
            await jarvis.addProjectStep(jarvis.activeProject!.id, stepText);
            setStepText('');
            await refreshSteps();
          })()} />
        </Card>
      ) : (
        <Card title="Create active project">
          <Field value={name} onChangeText={setName} placeholder="Project name" />
          <Field value={objective} onChangeText={setObjective} placeholder="Objective" multiline />
          <Button title="Create project" disabled={!name.trim() || !objective.trim()} onPress={() => void (async () => {
            await jarvis.createProject(name, objective);
            setName('');
            setObjective('');
          })()} />
        </Card>
      )}

      <Card title="All projects">
        {jarvis.projects.length ? jarvis.projects.map((project) => (
          <Card key={project.id} title={project.status}>
            <AppText>{project.name}</AppText>
            <AppText muted>{project.objective}</AppText>
            <Row>
              {project.status !== 'active' ? <Button title="Activate" onPress={() => void jarvis.setProjectStatus(project.id, 'active')} /> : null}
              {project.status === 'active' ? <Button title="Pause" onPress={() => void jarvis.setProjectStatus(project.id, 'paused')} /> : null}
              {project.status !== 'completed' ? <Button title="Complete" onPress={() => void jarvis.setProjectStatus(project.id, 'completed')} /> : null}
              <Button
                title="Delete"
                danger
                onPress={() => Alert.alert('Delete project?', 'Its steps will also be deleted locally.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => void deleteProject(project.id).then(jarvis.refresh) },
                ])}
              />
            </Row>
          </Card>
        )) : <AppText muted>No projects yet.</AppText>}
      </Card>
    </Screen>
  );
}
