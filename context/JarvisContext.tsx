import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { CompletionMessage, IntelligenceMode, ModelRuntimeState, RuntimeMetrics } from '@/lib/inference/types';
import type { JarvisProject, JarvisSettings, MemoryRecord, ProjectStep } from '@/lib/storage/types';
import {
  DEFAULT_SETTINGS,
  listMemories,
  listProjects,
  listProjectSteps,
  loadSettings,
  saveSettings,
  upsertMemory,
  upsertProject,
  upsertProjectStep,
} from '@/lib/storage/database';
import { selectMemoryContext, formatMemoryContext } from '@/lib/memory/retriever';
import { buildProjectContinuity, deriveProjectFields, formatProjectContinuity } from '@/lib/memory/projectContinuity';
import { buildMessages } from '@/lib/inference/promptBuilder';
import { readDevicePowerState, type PowerStateReading } from '@/lib/device/powerState';
import type { RuntimePlan } from '@/lib/inference/thermalPlan';
import { createId } from '@/lib/utils/ids';
import * as runtime from '@/lib/inference/standaloneModel';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';
import { executeToolWithAudit } from '@/lib/tools/execution';

export type StepStatus = ProjectStep['status'];

type ContextValue = {
  ready: boolean;
  initError?: string;
  settings: JarvisSettings;
  modelState: ModelRuntimeState;
  memories: MemoryRecord[];
  projects: JarvisProject[];
  activeProject?: JarvisProject;
  lastMetrics?: RuntimeMetrics;
  /**
   * The device readings the loaded runtime was actually sized from, or null
   * when adaptive sizing is off or no model is loaded. Diagnostics read this
   * rather than taking a fresh reading, so the UI reports what is running.
   */
  powerReading: PowerStateReading | null;
  /**
   * The runtime parameters the loaded context was actually built with. Null
   * when no model is loaded. Settings must display this rather than the
   * configured values, which can differ under adaptive sizing.
   */
  activeRuntimePlan: RuntimePlan | null;
  updateSettings: (patch: Partial<JarvisSettings>) => Promise<void>;
  refresh: () => Promise<void>;
  loadModel: () => Promise<void>;
  unloadModel: () => Promise<void>;
  validateModel: (path: string) => Promise<unknown>;
  ask: (text: string, mode: IntelligenceMode, onToken?: (token: string) => void, conversation?: CompletionMessage[]) => Promise<{ text: string; metrics: RuntimeMetrics }>;
  stopGeneration: () => Promise<void>;
  saveMemory: (title: string, body: string) => Promise<void>;
  createProject: (name: string, objective: string) => Promise<void>;
  setProjectStatus: (projectId: string, status: JarvisProject['status']) => Promise<void>;
  addProjectStep: (projectId: string, description: string) => Promise<void>;
  setProjectStepStatus: (projectId: string, stepId: string, status: StepStatus, detail?: string) => Promise<void>;};

const JarvisContext = createContext<ContextValue | null>(null);

export function JarvisProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string>();
  const [settings, setSettings] = useState<JarvisSettings>(DEFAULT_SETTINGS);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [projects, setProjects] = useState<JarvisProject[]>([]);
  const [modelState, setModelState] = useState<ModelRuntimeState>({ status: 'unloaded' });
  const [lastMetrics, setLastMetrics] = useState<RuntimeMetrics>();
  const [powerReading, setPowerReading] = useState<PowerStateReading | null>(null);
  const [activeRuntimePlan, setActiveRuntimePlan] = useState<RuntimePlan | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [storedSettings, storedMemories, storedProjects] = await Promise.all([
        loadSettings(),
        listMemories(),
        listProjects(),
      ]);
      setSettings(storedSettings);
      setMemories(storedMemories);
      setProjects(storedProjects);
      setModelState(runtime.getModelRuntimeState());
      setInitError(undefined);
    } catch (error) {
      setInitError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const updateSettings = useCallback(async (patch: Partial<JarvisSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  }, [settings]);

  const validateModel = useCallback(async (path: string) => runtime.validateGguf(path), []);

  const loadModel = useCallback(async () => {
    if (!settings.modelPath || !settings.modelName) throw new Error('NO_MODEL_SELECTED');

    if (settings.adaptiveRuntime) {
      // Size the runtime from what the device actually reports. Signals that
      // cannot be read stay undefined, and planRuntime treats them as
      // "not measured" rather than as spare headroom.
      const reading = await readDevicePowerState();
      setPowerReading(reading);
      const state = await runtime.loadLocalModel(settings.modelPath, settings.modelName, {
        device: reading.state,
      });
      setActiveRuntimePlan(runtime.getActiveRuntimePlan());
      setModelState(state);
      return;
    }

    setPowerReading(null);
    const state = await runtime.loadLocalModel(settings.modelPath, settings.modelName, {
      contextSize: settings.contextSize,
      batchSize: settings.batchSize,
      threads: settings.threads,
      gpuLayers: settings.gpuLayers,
    });
    setActiveRuntimePlan(runtime.getActiveRuntimePlan());
    setModelState(state);
  }, [settings]);

  const unloadModel = useCallback(async () => {
    await runtime.unloadLocalModel();
    setPowerReading(null);
    setActiveRuntimePlan(null);
    setModelState(runtime.getModelRuntimeState());
  }, []);

  const activeProject = projects.find((project) => project.status === 'active');

  const ask = useCallback(async (text: string, mode: IntelligenceMode, onToken?: (token: string) => void, conversation: CompletionMessage[] = []) => {
    if (!text.trim()) throw new Error('EMPTY_MESSAGE');

    const deterministic = routeDeterministicTool(text);
    if (deterministic) {
      const startedAt = performance.now();
      const toolResult = await executeToolWithAudit(deterministic.call);
      const metrics: RuntimeMetrics = { totalMs: performance.now() - startedAt };
      setLastMetrics(metrics);
      if (!toolResult.ok) throw new Error(toolResult.error ?? 'TOOL_EXECUTION_FAILED');
      const dataSuffix = deterministic.call.tool === 'termux.system_status'
        ? `\n${JSON.stringify(toolResult.data, null, 2)}`
        : '';
      return { text: `${deterministic.successMessage}${dataSuffix}`, metrics };
    }

    let memoryContext: string | undefined;
    if (settings.approvedMemoryEnabled) {
      memoryContext = formatMemoryContext(selectMemoryContext(text, memories));
    }

    let projectContext: string | undefined;
    if (activeProject) {
      const steps = await listProjectSteps(activeProject.id);
      projectContext = formatProjectContinuity(buildProjectContinuity(activeProject, steps));
    }

    const boundedConversation = conversation.slice(-12);
    const messages = buildMessages({
      mode,
      // The Settings language toggle previously only changed the TTS voice, so
      // selecting Arabic still produced English answers. It now reaches the model.
      language: settings.language,
      projectContext,
      memoryContext,
      conversation: boundedConversation,
      userMessage: text,
    });
    const result = await runtime.runCompletion({ messages, mode, onToken });
    setLastMetrics(result.metrics);
    return result;
  }, [activeProject, memories, settings.approvedMemoryEnabled, settings.language]);

  const stopGeneration = useCallback(async () => {
    await runtime.stopGeneration();
  }, []);

  const saveMemory = useCallback(async (title: string, body: string) => {
    const cleanBody = body.trim();
    if (!cleanBody) throw new Error('MEMORY_EMPTY');
    const now = Date.now();
    await upsertMemory({
      id: createId('mem'),
      title: title.trim() || 'Memory',
      body: cleanBody,
      type: 'note',
      source: 'manual',
      approved: true,
      pinned: false,
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    setMemories(await listMemories());
  }, []);

  const createProject = useCallback(async (name: string, objective: string) => {
    const cleanName = name.trim();
    const cleanObjective = objective.trim();
    if (!cleanName || !cleanObjective) throw new Error('PROJECT_FIELDS_REQUIRED');
    const now = Date.now();
    for (const project of projects.filter((item) => item.status === 'active')) {
      await upsertProject({ ...project, status: 'paused', updatedAt: now });
    }
    await upsertProject({
      id: createId('project'),
      name: cleanName,
      objective: cleanObjective,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    setProjects(await listProjects());
  }, [projects]);

  const setProjectStatus = useCallback(async (projectId: string, status: JarvisProject['status']) => {
    const current = projects.find((project) => project.id === projectId);
    if (!current) throw new Error('PROJECT_NOT_FOUND');
    const now = Date.now();

    if (status === 'active') {
      for (const project of projects.filter((item) => item.status === 'active' && item.id !== projectId)) {
        await upsertProject({ ...project, status: 'paused', updatedAt: now });
      }
    }

    await upsertProject({
      ...current,
      status,
      nextAction: status === 'completed' ? undefined : current.nextAction,
      updatedAt: now,
    });
    setProjects(await listProjects());
  }, [projects]);

  const addProjectStep = useCallback(async (projectId: string, description: string) => {
    const clean = description.trim();
    if (!clean) throw new Error('PROJECT_STEP_EMPTY');
    const steps = await listProjectSteps(projectId);
    await upsertProjectStep({
      id: createId('step'),
      projectId,
      sequence: steps.length + 1,
      description: clean,
      status: 'pending',
    });

    const project = projects.find((item) => item.id === projectId);
    if (project) {
      const updatedSteps = await listProjectSteps(projectId);
      const derived = deriveProjectFields(updatedSteps);
      await upsertProject({ ...project, ...derived, updatedAt: Date.now() });
      setProjects(await listProjects());
    }
  }, [projects]);

  const setProjectStepStatus = useCallback(async (projectId: string, stepId: string, status: StepStatus, detail?: string) => {
    const steps = await listProjectSteps(projectId);
    const step = steps.find((item) => item.id === stepId);
    if (!step) throw new Error('PROJECT_STEP_NOT_FOUND');
    const now = Date.now();
    const nextStep: ProjectStep = {
      ...step,
      status,
      startedAt: status === 'running' ? (step.startedAt ?? now) : step.startedAt,
      finishedAt: status === 'success' || status === 'failed' || status === 'skipped' ? now : undefined,
      result: status === 'success' ? (detail?.trim() || step.result) : step.result,
      error: status === 'failed' ? (detail?.trim() || step.error || 'Marked failed by owner') : undefined,
    };
    await upsertProjectStep(nextStep);

    const project = projects.find((item) => item.id === projectId);
    if (project) {
      const updatedSteps = await listProjectSteps(projectId);
      const derived = deriveProjectFields(updatedSteps);
      await upsertProject({ ...project, ...derived, updatedAt: now });
      setProjects(await listProjects());
    }
  }, [projects]);

  const value = useMemo<ContextValue>(() => ({
    ready,
    initError,
    settings,
    modelState,
    memories,
    projects,
    activeProject,
    lastMetrics,
    powerReading,
    activeRuntimePlan,
    updateSettings,
    refresh,
    loadModel,
    unloadModel,
    validateModel,
    ask,
    stopGeneration,
    saveMemory,
    createProject,
    setProjectStatus,
    addProjectStep,
    setProjectStepStatus,
  }), [
    ready, initError, settings, modelState, memories, projects, activeProject, lastMetrics,
    powerReading, activeRuntimePlan, updateSettings, refresh, loadModel, unloadModel, validateModel, ask, stopGeneration,
    saveMemory, createProject, setProjectStatus, addProjectStep, setProjectStepStatus,
  ]);

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}

export function useJarvis(): ContextValue {
  const value = useContext(JarvisContext);
  if (!value) throw new Error('useJarvis must be used inside JarvisProvider');
  return value;
}
