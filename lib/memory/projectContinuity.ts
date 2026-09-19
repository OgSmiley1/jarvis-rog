import type { JarvisProject, ProjectStep } from '@/lib/storage/types';

export interface ProjectContinuitySnapshot {
  activeObjective: string;
  lastCompleted: string;
  failedAttempts: string[];
  pendingTasks: string[];
  nextAction: string;
}

export interface DerivedProjectFields {
  lastCompletedStep?: string;
  nextAction?: string;
}

export function deriveProjectFields(steps: ProjectStep[]): DerivedProjectFields {
  const successful = steps
    .filter((step) => step.status === 'success')
    .sort((a, b) => b.sequence - a.sequence);
  const pending = steps
    .filter((step) => step.status === 'pending' || step.status === 'running' || step.status === 'failed')
    .sort((a, b) => a.sequence - b.sequence);

  return {
    lastCompletedStep: successful[0]?.description,
    nextAction: pending[0]?.description,
  };
}

export function buildProjectContinuity(
  project: JarvisProject,
  steps: ProjectStep[],
): ProjectContinuitySnapshot {
  const success = steps.filter((step) => step.status === 'success').sort((a, b) => b.sequence - a.sequence);
  const failed = steps.filter((step) => step.status === 'failed').sort((a, b) => a.sequence - b.sequence);
  const pending = steps.filter((step) => step.status === 'pending' || step.status === 'running').sort((a, b) => a.sequence - b.sequence);

  return {
    activeObjective: project.objective,
    lastCompleted: project.lastCompletedStep ?? success[0]?.description ?? 'Nothing completed yet.',
    failedAttempts: failed.map((step) => `${step.description}${step.error ? ` — ${step.error}` : ''}`),
    pendingTasks: pending.map((step) => step.description),
    nextAction: project.nextAction ?? pending[0]?.description ?? failed[0]?.description ?? 'Define the next concrete action.',
  };
}

export function formatProjectContinuity(snapshot: ProjectContinuitySnapshot): string {
  return [
    `ACTIVE OBJECTIVE: ${snapshot.activeObjective}`,
    `LAST COMPLETED: ${snapshot.lastCompleted}`,
    `FAILED ATTEMPTS: ${snapshot.failedAttempts.length ? snapshot.failedAttempts.join(' | ') : 'None'}`,
    `PENDING TASKS: ${snapshot.pendingTasks.length ? snapshot.pendingTasks.join(' | ') : 'None'}`,
    `NEXT ACTION: ${snapshot.nextAction}`,
  ].join('\n');
}
