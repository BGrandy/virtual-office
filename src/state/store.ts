// Glue between the engine and React.
// - `sim` is the single simulation instance (mutable, ticked every animation frame).
// - The 3D scene reads `sim.state` directly inside its render loop (60 fps, no React renders).
// - Panels subscribe to `rev`, which bumps when something discrete changes or 5x a second.
// - UI-only state (selection, camera, dialogs, tour, AI settings) lives in the zustand store.
// - Live AI calls are made here, outside the engine, and results are handed back with provideAI.

import { create } from 'zustand';
import { errorMessage, modelLabel, runStage, testConnection } from '../ai/anthropic';
import { BUSY_MORNING } from '../sim/data';
import { Simulation } from '../sim/engine';
import { DEFAULT_VALUE, type ValueAssumptions } from '../sim/metrics';
import type { AgentId, ApprovalPolicy, SimState, Task, WorkStage } from '../sim/types';

const KEY = 'atrium.sim.v5';
const SEEN_KEY = 'atrium.seen-welcome';
const AI_KEY = 'atrium.ai';
const VALUE_KEY = 'atrium.value';
const QUALITY_KEY = 'atrium.quality';

export type Quality = 'auto' | 'full' | 'light';

const store = {
  get(k: string, session = false) {
    try { return (session ? sessionStorage : localStorage).getItem(k); } catch { return null; }
  },
  set(k: string, v: string | null, session = false) {
    try {
      const s = session ? sessionStorage : localStorage;
      if (v === null) s.removeItem(k); else s.setItem(k, v);
    } catch { /* storage unavailable (private mode, sandboxed preview): keep in memory */ }
  },
};

function load(): SimState | null {
  const raw = store.get(KEY);
  try { return raw ? (JSON.parse(raw) as SimState) : null; } catch { return null; }
}
function save() { store.set(KEY, JSON.stringify(sim.state)); }

// ------------------------------------------------------------------ AI settings

export interface AISettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  remember: boolean;
}
const DEFAULT_AI: AISettings = { enabled: false, apiKey: '', model: 'claude-haiku-5-5', remember: false };

function loadAI(): AISettings {
  const raw = store.get(AI_KEY) ?? store.get(AI_KEY, true);
  try { return raw ? { ...DEFAULT_AI, ...JSON.parse(raw) } : DEFAULT_AI; } catch { return DEFAULT_AI; }
}
function persistAI(a: AISettings) {
  // The key is kept for this tab only unless the user ticks "remember on this device".
  store.set(AI_KEY, a.remember ? JSON.stringify(a) : null);
  store.set(AI_KEY, a.remember ? null : JSON.stringify(a), true);
}

// --------------------------------------------------------------- live AI calls

const inFlight = new Set<string>();
function requestAI(task: Task, stage: WorkStage, key: string) {
  const id = `${task.id}|${key}`;
  if (inFlight.has(id)) return;
  const ai = useUI.getState().ai;
  if (!ai.enabled || !ai.apiKey) {
    sim.provideAI(task.id, key, { status: 'error', error: 'live AI is turned off' });
    return;
  }
  inFlight.add(id);
  const slot = task.ai[key];
  if (slot) slot.model = modelLabel(ai.model);
  // Snapshot the task so later changes do not alter what this call sees.
  const snapshot = JSON.parse(JSON.stringify(task)) as Task;
  runStage({ apiKey: ai.apiKey, model: ai.model }, snapshot, stage)
    .then((r) => sim.provideAI(task.id, key, r))
    .catch((e) => {
      const msg = errorMessage(e);
      sim.provideAI(task.id, key, { status: 'error', error: msg });
      useUI.setState({ aiError: msg });
    })
    .finally(() => inFlight.delete(id));
}

export const sim = new Simulation(load(), { requestAI });
// Handy in the browser console and for automated checks: __atrium.step(5), __atrium.state
(globalThis as unknown as { __atrium: Simulation }).__atrium = sim;

// -------------------------------------------------------------------- UI state

export type Selection = { kind: 'agent'; id: AgentId } | { kind: 'task'; id: string } | { kind: 'human' } | null;
export type CameraFocus = Selection | 'overview';
export type LeftTab = 'tasks' | 'feed' | 'dashboard';

interface UIState {
  rev: number;
  selected: Selection;
  follow: boolean;
  /** Overrides what the camera tracks (used by the tour). */
  focus: CameraFocus | null;
  tab: LeftTab;
  dialog: 'welcome' | 'about' | 'ai' | null;
  cameraReset: number;
  leftOpen: boolean;
  tour: { step: number; taskId?: string; prevSpeed: number } | null;
  ai: AISettings;
  aiError?: string;
  value: ValueAssumptions;
  /** Graphics setting chosen by the viewer, and whether auto mode has dropped to light. */
  quality: Quality;
  autoLight: boolean;
  select: (s: Selection, follow?: boolean) => void;
  setFollow: (f: boolean) => void;
  setTab: (t: LeftTab) => void;
  setDialog: (d: UIState['dialog']) => void;
  resetCamera: () => void;
  toggleLeft: () => void;
}

export const isNarrow = () => typeof innerWidth !== 'undefined' && innerWidth <= 900;

export const useUI = create<UIState>((set) => ({
  rev: 0,
  selected: null,
  follow: false,
  focus: null,
  tab: 'tasks',
  dialog: store.get(SEEN_KEY) === '1' && sim.state.tasks.length > 0 ? null : 'welcome',
  cameraReset: 0,
  leftOpen: !isNarrow(),
  tour: null,
  ai: loadAI(),
  value: (() => { try { return { ...DEFAULT_VALUE, ...JSON.parse(store.get(VALUE_KEY) ?? '{}') }; } catch { return DEFAULT_VALUE; } })(),
  quality: (() => {
    const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('quality') ?? store.get(QUALITY_KEY);
    return q === 'full' || q === 'light' ? q : 'auto';
  })(),
  autoLight: false,
  // On a phone the two panels share the bottom of the screen, so opening details closes the list.
  select: (selected, follow) => set((s) => ({ selected, follow: selected ? follow ?? s.follow : false, ...(selected && isNarrow() ? { leftOpen: false } : {}) })),
  setFollow: (follow) => set({ follow }),
  setTab: (tab) => set({ tab }),
  setDialog: (dialog) => {
    if (dialog === null) store.set(SEEN_KEY, '1');
    set({ dialog });
  },
  resetCamera: () => set((s) => ({ cameraReset: s.cameraReset + 1, follow: false, focus: null })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen, ...(isNarrow() && !s.leftOpen ? { selected: null } : {}) })),
}));

const bump = () => useUI.setState((s) => ({ rev: s.rev + 1 }));

/** Subscribe a component to simulation changes and get the current state. */
export function useSim(): SimState {
  useUI((s) => s.rev);
  return sim.state;
}

// -------------------------------------------------------------------- commands

const mode = () => (useUI.getState().ai.enabled ? 'ai' : 'script');
const run = <T,>(fn: () => T): T => {
  const r = fn();
  sim.dirty = false;
  bump();
  save();
  return r;
};

export const actions = {
  createTask: (templateId: string, title?: string) => run(() => sim.createTask(templateId, title, mode())),
  busyMorning: () => run(() => BUSY_MORNING.map((id) => sim.createTask(id, undefined, mode()))),
  approve: (id: string, note?: string) => run(() => sim.approve(id, note)),
  reject: (id: string, note?: string) => run(() => sim.reject(id, note)),
  setHeld: (id: string, held: boolean) => run(() => sim.setHeld(id, held)),
  cancel: (id: string) => run(() => sim.cancel(id)),
  reassign: (id: string, to: AgentId) => run(() => sim.reassign(id, to)),
  setPolicy: (p: ApprovalPolicy) => run(() => sim.setPolicy(p)),
  setSpeed: (n: number) => run(() => sim.setSpeed(n)),
  setPaused: (p: boolean) => run(() => sim.setPaused(p)),
  reset: () => {
    run(() => sim.reset());
    inFlight.clear();
    useUI.setState({ selected: null, follow: false, focus: null, tour: null, dialog: 'welcome' });
  },

  // Guided tour
  startTour: () => {
    useUI.setState({ tour: { step: 0, prevSpeed: sim.state.speed }, dialog: null, focus: 'overview', selected: null, follow: false, tab: 'tasks', leftOpen: !isNarrow() });
    store.set(SEEN_KEY, '1');
    if (sim.state.paused) actions.setPaused(false);
  },
  tourTo: (step: number, patch: Partial<NonNullable<UIState['tour']>> = {}) =>
    useUI.setState((s) => (s.tour ? { tour: { ...s.tour, ...patch, step } } : {})),
  endTour: () => {
    const t = useUI.getState().tour;
    if (t) actions.setSpeed(t.prevSpeed);
    useUI.setState((s) => ({ tour: null, focus: null, cameraReset: s.cameraReset + 1 }));
  },

  setValue: (patch: Partial<ValueAssumptions>) => {
    const value = { ...useUI.getState().value, ...patch };
    store.set(VALUE_KEY, JSON.stringify(value));
    useUI.setState({ value });
  },
  resetValue: () => {
    store.set(VALUE_KEY, null);
    useUI.setState({ value: DEFAULT_VALUE });
  },
  setQuality: (quality: Quality) => {
    store.set(QUALITY_KEY, quality === 'auto' ? null : quality);
    useUI.setState({ quality, autoLight: false });
  },

  // Live AI
  saveAI: (patch: Partial<AISettings>) => {
    const next = { ...useUI.getState().ai, ...patch };
    persistAI(next);
    useUI.setState({ ai: next, aiError: undefined });
  },
  testAndEnableAI: async (apiKey: string, model: string, remember: boolean) => {
    await testConnection({ apiKey, model });
    actions.saveAI({ enabled: true, apiKey, model, remember });
  },
  disableAI: () => actions.saveAI({ enabled: false }),
  forgetAI: () => actions.saveAI({ ...DEFAULT_AI }),
};

// ------------------------------------------------------------------- main loop

let last = performance.now();
let lastPublish = 0;
let lastSave = 0;
function advance(now: number, maxDt: number) {
  let dt = Math.min(maxDt, (now - last) / 1000);
  last = now;
  // Big gaps (background tab) are stepped in small slices so walking and timing stay accurate.
  while (dt > 1e-6) {
    const d = Math.min(0.1, dt);
    sim.step(d);
    dt -= d;
  }
  if (sim.dirty || now - lastPublish > 200) {
    sim.dirty = false;
    lastPublish = now;
    bump();
  }
  if (now - lastSave > 2000) {
    lastSave = now;
    save();
  }
}
function frame(now: number) {
  if (!document.hidden) advance(now, 0.1);
  requestAnimationFrame(frame);
}
if (typeof requestAnimationFrame !== 'undefined') {
  requestAnimationFrame(frame);
  // Browsers stop animation frames in background tabs; keep the office running at a lower rate.
  setInterval(() => { if (document.hidden) advance(performance.now(), 5); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) last = performance.now(); });
}
