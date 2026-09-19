import { describe, expect, it } from 'vitest';
import { buildProjectContinuity, deriveProjectFields } from '@/lib/memory/projectContinuity';
import type { JarvisProject, ProjectStep } from '@/lib/storage/types';

const project: JarvisProject = {
  id: 'p1',
  name: 'Jarvis',
  objective: 'Ship APK',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
};

const steps: ProjectStep[] = [
  { id: 's1', projectId: 'p1', sequence: 1, description: 'Audit', status: 'success' },
  { id: 's2', projectId: 'p1', sequence: 2, description: 'Fix build', status: 'failed', error: 'Gradle error' },
  { id: 's3', projectId: 'p1', sequence: 3, description: 'Run device test', status: 'pending' },
];

describe('project continuity', () => {
  it('finds last completed and next pending action', () => {
    const snapshot = buildProjectContinuity(project, steps);
    expect(snapshot.lastCompleted).toBe('Audit');
    expect(snapshot.nextAction).toBe('Run device test');
  });

  it('keeps failed attempts visible', () => {
    expect(buildProjectContinuity(project, steps).failedAttempts[0]).toContain('Gradle error');
  });

  it('derives persisted continuity fields from real step status', () => {
    expect(deriveProjectFields(steps)).toEqual({
      lastCompletedStep: 'Audit',
      nextAction: 'Fix build',
    });
  });

  it('moves next action when a failed step succeeds', () => {
    const recovered = steps.map((step) => step.id === 's2' ? { ...step, status: 'success' as const } : step);
    expect(deriveProjectFields(recovered)).toEqual({
      lastCompletedStep: 'Fix build',
      nextAction: 'Run device test',
    });
  });
});
