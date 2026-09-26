import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
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
type RuntimeModule = typeof import('@/lib/inference/standaloneModel');
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';
import { executeToolWithAudit } from '@/lib/tools/execution';
import { listToolNames } from '@/lib/tools/registry';
import { buildToolCallGrammar, parseToolCall } from '@/lib/tools/grammar';
import { buildToolPlanningMessages, looksLikeToolRequest, NO_TOOL } from '@/lib/tools/planner';
import { setVoicePreference } from '@/lib/voice/voiceResponse';
import { canDrawOverlays, showFloatingOrb } from '@/lib/device/overlay';
import { downloadRecommendedModel, type ImportedModel } from '@/lib/inference/modelImport';
import type { DownloadView } from '@/lib/inference/brainPresence';
import {
  deleteModelFile,
  downloadWithSystem,
  findInstalledModel,
  hasPendingSystemDownload,
  hasSystemDownloader,
} from '@/lib/inference/brainStore';
import { recordLive } from '@/lib/telemetry/liveLog';
import { stripThinking } from '@/lib/voice/stripThinking';
import { setBrainReader } from '@/lib/tools/utilityTools';
import { shortModelName } from '@/lib/hud/dashboard';
import { Platform } from 'react-native';
import { askCloud, type CloudProviderId, type FetchLike } from '@/lib/online/cloudBrain';
import { clearCloudKey, cloudProvidersWithKeys, readCloudKeys, setCloudKey } from '@/lib/online/cloudKeys';

/**
 * Which brain produced an answer. Shown on the HUD, so the owner always knows
 * whether a reply stayed on the phone or went to a cloud provider.
 */
export type AnswerSource = 'local' | 'tool' | `cloud:${CloudProviderId}`;

/** A phone tool's spoken sentence, when it returned one. */
function toolSpeech(data: unknown): { speech: string; private: boolean } | null {
  if (!data || typeof data !== 'object') return null;
  const { speech, private: secret } = data as { speech?: unknown; private?: unknown };
  return typeof speech === 'string' ? { speech, private: secret === true } : null;
}

let runtimePromise: Promise<RuntimeModule> | null = null;

function getRuntime(): Promise<RuntimeModule> {
  if (!runtimePromise) runtimePromise = import('@/lib/inference/standaloneModel');
  return runtimePromise;
}

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
  loadModel: (selection?: { path: string; name: string }) => Promise<void>;
  unloadModel: () => Promise<void>;
  validateModel: (path: string) => Promise<unknown>;
  /**
   * Give JARVIS its brain in one call: load the file already on the phone if
   * there is one; otherwise download the recommended GGUF (or attach to the
   * download Android is already running), validate it, select it and load it.
   * Settings and the HUD both use this, so there is exactly one implementation.
   */
  installRecommendedModel: (onProgress?: (progress: number) => void) => Promise<ImportedModel>;
  /** The brain download in progress, or null. Survives the app being closed and reopened. */
  brainDownload: DownloadView | null;
  /** Cloud providers with a key stored in the keystore. Never the keys themselves. */
  cloudProviders: CloudProviderId[];
  /** True when the cloud brain is switched on and at least one key is stored. */
  cloudReady: boolean;
  saveCloudKey: (id: CloudProviderId, key: string) => Promise<void>;
  removeCloudKey: (id: CloudProviderId) => Promise<void>;
  /**
   * `options.spoken` tells the prompt builder the answer will be read aloud,
   * which changes how it is written (short spoken sentences, no markdown) but
   * not what it says. The HUD sets it; typed Chat does not.
   */
  ask: (
    text: string,
    mode: IntelligenceMode,
    onToken?: (token: string) => void,
    conversation?: CompletionMessage[],
    options?: { spoken?: boolean },
  ) => Promise<{ text: string; metrics: RuntimeMetrics; source: AnswerSource; private?: boolean }>;
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
  const [cloudProviders, setCloudProviders] = useState<CloudProviderId[]>([]);
  const [brainDownload, setBrainDownload] = useState<DownloadView | null>(null);
  const brainJob = useRef<Promise<ImportedModel> | null>(null);
  const brainBootTried = useRef(false);

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
      setCloudProviders(await cloudProvidersWithKeys().catch(() => []));
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

  useEffect(() => {
    // The voice choice has to reach the speech layer at launch, not only when
    // the owner happens to open Settings — otherwise the first thing JARVIS
    // says after a cold start uses whatever the platform picks by default.
    setVoicePreference({
      allowNetwork: settings.ttsAllowNetworkVoice,
      preferredIdentifier: settings.ttsVoiceId,
    });
  }, [settings.ttsAllowNetworkVoice, settings.ttsVoiceId]);

  useEffect(() => {
    // Bring the floating orb back after a restart if the owner left it on.
    // canDrawOverlays() is re-checked because the permission can be revoked
    // in Android settings while JARVIS is not running.
    if (!ready || !settings.floatingOrbEnabled) return;
    if (canDrawOverlays()) showFloatingOrb();
  }, [ready, settings.floatingOrbEnabled]);

  const updateSettings = useCallback(async (patch: Partial<JarvisSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  }, [settings]);

  const validateModel = useCallback(async (path: string) => {
    const runtime = await getRuntime();
    return runtime.validateGguf(path);
  }, []);

  const loadModel = useCallback(async (selection?: { path: string; name: string }) => {
    const modelPath = selection?.path ?? settings.modelPath;
    const modelName = selection?.name ?? settings.modelName;
    if (!modelPath || !modelName) throw new Error('NO_MODEL_SELECTED');

    const runtime = await getRuntime();
    try {
      if (settings.adaptiveRuntime) {
        // Size the runtime from what the device actually reports. Signals that
        // cannot be read stay undefined, and planRuntime treats them as
        // "not measured" rather than as spare headroom.
        const reading = await readDevicePowerState();
        setPowerReading(reading);
        const state = await runtime.loadLocalModel(modelPath, modelName, {
          device: reading.state,
          ...(settings.gpuAcceleration ? {} : { gpuLayers: 0 }),
        });
        setActiveRuntimePlan(runtime.getActiveRuntimePlan());
        setModelState(state);
        return;
      }

      setPowerReading(null);
      const state = await runtime.loadLocalModel(modelPath, modelName, {
        contextSize: settings.contextSize,
        batchSize: settings.batchSize,
        threads: settings.threads,
        gpuLayers: settings.gpuAcceleration ? settings.gpuLayers : 0,
      });
      setActiveRuntimePlan(runtime.getActiveRuntimePlan());
      setModelState(state);
    } catch (error) {
      // Without this the HUD stays on "unloaded" and offers a fresh 2.5 GB
      // download — which would delete the file that is already here.
      const message = error instanceof Error ? error.message : String(error);
      setModelState({ status: 'error', modelPath, modelName, error: message });
      recordLive('brain', 'load failed', { raw: message, path: modelPath });
      throw error;
    }
  }, [settings]);

  const installRecommendedModel = useCallback((onProgress?: (progress: number) => void) => {
    if (brainJob.current) return brainJob.current;
    const job = (async (): Promise<ImportedModel> => {
      let model: ImportedModel | null = findInstalledModel({ path: settings.modelPath, name: settings.modelName });
      if (model) {
        recordLive('brain', 'found on phone', { path: model.path, size: model.size });
      } else {
        recordLive('brain', 'download started', { system: hasSystemDownloader() });
        setBrainDownload({ progress: 0, done: false, failed: false });
        try {
          model = hasSystemDownloader()
            ? await downloadWithSystem((view) => {
                setBrainDownload(view);
                if (view.progress !== null) onProgress?.(view.progress);
              })
            : await downloadRecommendedModel((progress) => {
                setBrainDownload({ progress, done: false, failed: false });
                onProgress?.(progress);
              });
        } finally {
          setBrainDownload(null);
        }
        recordLive('brain', 'download finished', { path: model.path, size: model.size });

        // Validate a fresh download before selecting it: a corrupt file must
        // never become the configured model.
        if (Platform.OS === 'android') {
          try {
            const runtime = await getRuntime();
            await runtime.validateGguf(model.path);
          } catch (error) {
            deleteModelFile(model.path);
            throw new Error(`GGUF validation failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      if (settings.modelPath !== model.path || settings.modelName !== model.name) {
        const next = { ...settings, modelPath: model.path, modelName: model.name, modelSize: model.size };
        setSettings(next);
        await saveSettings(next);
      }
      await loadModel({ path: model.path, name: model.name });
      return model;
    })();
    brainJob.current = job;
    void job.catch(() => undefined).finally(() => {
      brainJob.current = null;
    });
    return job;
  }, [loadModel, settings]);

  const saveCloudKey = useCallback(async (id: CloudProviderId, key: string) => {
    await setCloudKey(id, key);
    setCloudProviders(await cloudProvidersWithKeys());
  }, []);

  const removeCloudKey = useCallback(async (id: CloudProviderId) => {
    await clearCloudKey(id);
    setCloudProviders(await cloudProvidersWithKeys());
  }, []);

  const cloudReady = settings.cloudFallbackEnabled && cloudProviders.length > 0;

  useEffect(() => {
    // "System information" reports the brain as the app knows it right now.
    setBrainReader(() => ({
      brain:
        modelState.status === 'ready' ? 'ready' : modelState.status === 'loading' ? 'loading' : cloudReady ? 'cloud' : 'none',
      name: shortModelName(modelState.modelName ?? settings.modelName),
    }));
  }, [modelState.status, modelState.modelName, settings.modelName, cloudReady]);

  const unloadModel = useCallback(async () => {
    const runtime = await getRuntime();
    await runtime.unloadLocalModel();
    setPowerReading(null);
    setActiveRuntimePlan(null);
    setModelState(runtime.getModelRuntimeState());
  }, []);

  useEffect(() => {
    // At launch: load the brain already on the phone, or pick the download
    // Android kept running while JARVIS was closed back up. Never starts a
    // new download on its own.
    if (!ready || brainBootTried.current) return;
    brainBootTried.current = true;
    let present = false;
    try {
      present = Boolean(findInstalledModel({ path: settings.modelPath, name: settings.modelName })) || hasPendingSystemDownload();
    } catch (error) {
      recordLive('error', 'brain lookup failed', { raw: error instanceof Error ? error.message : String(error) });
    }
    if (!present) {
      recordLive('brain', 'none on phone');
      return;
    }
    void installRecommendedModel().catch((error) =>
      recordLive('error', 'brain start failed', { raw: error instanceof Error ? error.message : String(error) }),
    );
  }, [ready, settings.modelPath, settings.modelName, installRecommendedModel]);

  const activeProject = projects.find((project) => project.status === 'active');

  const ask = useCallback(async (
    text: string,
    mode: IntelligenceMode,
    onToken?: (token: string) => void,
    conversation: CompletionMessage[] = [],
    options: { spoken?: boolean } = {},
  ) => {
    if (!text.trim()) throw new Error('EMPTY_MESSAGE');

    const deterministic = routeDeterministicTool(text);
    if (deterministic) {
      const startedAt = performance.now();
      const toolResult = await executeToolWithAudit(deterministic.call);
      const metrics: RuntimeMetrics = { totalMs: performance.now() - startedAt };
      setLastMetrics(metrics);
      if (!toolResult.ok) throw new Error(toolResult.error ?? 'TOOL_EXECUTION_FAILED');
      const said = toolSpeech(toolResult.data);
      if (said) return { text: said.speech, metrics, source: 'tool' as AnswerSource, private: said.private };
      const dataSuffix = deterministic.call.tool === 'termux.system_status'
        ? `\n${JSON.stringify(toolResult.data, null, 2)}`
        : '';
      return { text: `${deterministic.successMessage}${dataSuffix}`, metrics, source: 'tool' as AnswerSource };
    }

    if (looksLikeToolRequest(text) && modelState.status === 'ready') {
      const runtime = await getRuntime();
      const allowedTools = [...listToolNames(), NO_TOOL];
      const planner = await runtime.runCompletion({
        messages: buildToolPlanningMessages(text, settings.language),
        mode: 'fast',
        grammar: buildToolCallGrammar(allowedTools),
      });

      try {
        const planned = parseToolCall(planner.text, allowedTools);
        if (planned.tool !== NO_TOOL) {
          const toolResult = await executeToolWithAudit({
            id: createId('tool'),
            tool: planned.tool,
            arguments: planned.arguments,
          });
          setLastMetrics(planner.metrics);

          if (!toolResult.ok) throw new Error(toolResult.error ?? 'TOOL_EXECUTION_FAILED');
          const said = toolSpeech(toolResult.data);
          if (said) return { text: said.speech, metrics: planner.metrics, source: 'tool' as AnswerSource, private: said.private };

          const summary = settings.language === 'ar'
            ? `تم تنفيذ ${planned.tool}.`
            : `Done. ${planned.tool} completed.`;
          const dataSuffix = toolResult.data === undefined
            ? ''
            : `\n${JSON.stringify(toolResult.data, null, 2)}`;
          return { text: `${summary}${dataSuffix}`, metrics: planner.metrics, source: 'tool' as AnswerSource };
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'CONFIRMATION_REQUIRED') throw error;
        // If planning output is invalid or no executable tool was selected,
        // continue to the normal assistant answer instead of pretending an action ran.
      }
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
      ownerProfileContext: settings.ownerProfile,
      projectContext,
      memoryContext,
      conversation: boundedConversation,
      userMessage: text,
      spoken: options.spoken ?? false,
    });

    // A loaded local brain always answers first. The cloud brain is only for
    // when there is no local brain to ask — the exact state observed on the
    // owner's ROG, where runCompletion threw MODEL_NOT_LOADED on every turn.
    if (modelState.status !== 'ready' && settings.cloudFallbackEnabled) {
      const answer = await askCloud({
        messages,
        mode,
        keys: await readCloudKeys(),
        models: settings.cloudModels,
        fetchImpl: fetch as unknown as FetchLike,
      });
      // Not streamed (see cloudBrain.ts): the whole reply arrives at once and
      // goes through the same token callback, so the HUD's sentence-level
      // speech handles it exactly as it handles the local brain.
      // Cloud reasoning models can think out loud too; the same rule applies.
      const cloudText = stripThinking(answer.text) || answer.text;
      onToken?.(cloudText);
      setLastMetrics(answer.metrics);
      return { text: cloudText, metrics: answer.metrics, source: `cloud:${answer.provider}` as AnswerSource };
    }

    const runtime = await getRuntime();
    const result = await runtime.runCompletion({ messages, mode, onToken });
    setLastMetrics(result.metrics);
    return { ...result, source: 'local' as AnswerSource };
  }, [
    activeProject,
    memories,
    modelState.status,
    settings.approvedMemoryEnabled,
    settings.cloudFallbackEnabled,
    settings.cloudModels,
    settings.language,
    settings.ownerProfile,
  ]);

  const stopGeneration = useCallback(async () => {
    const runtime = await getRuntime();
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
    installRecommendedModel,
    brainDownload,
    cloudProviders,
    cloudReady,
    saveCloudKey,
    removeCloudKey,
    ask,
    stopGeneration,
    saveMemory,
    createProject,
    setProjectStatus,
    addProjectStep,
    setProjectStepStatus,
  }), [
    ready, initError, settings, modelState, memories, projects, activeProject, lastMetrics,
    powerReading, activeRuntimePlan, updateSettings, refresh, loadModel, unloadModel, validateModel, installRecommendedModel, brainDownload, cloudProviders, cloudReady, saveCloudKey, removeCloudKey, ask, stopGeneration,
    saveMemory, createProject, setProjectStatus, addProjectStep, setProjectStepStatus,
  ]);

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}

export function useJarvis(): ContextValue {
  const value = useContext(JarvisContext);
  if (!value) throw new Error('useJarvis must be used inside JarvisProvider');
  return value;
}
