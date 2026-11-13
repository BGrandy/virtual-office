// Glue between the engine and React.
// - `sim` is the single simulation instance (mutable, ticked every animation frame).
// - The 3D scene reads `sim.state` directly inside its render loop (60 fps, no React renders).
// - Panels subscribe to `rev`, which bumps when something discrete changes or 5x a second.
// - UI-only state (selection, camera follow, open dialogs) lives in the zustand store.

import { create } from 'zustand';
import { Simulation } from '../sim/engine';
import type { AgentId, ApprovalPolicy, SimState } from '../sim/types';

const KEY = 'atrium.sim.v4';
const SEEN_KEY = 'atrium.seen-welcome';

function load(): SimState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SimState) : null;
  } catch {
    return null; // storage unavailable (private mode, sandboxed preview): run in memory
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(sim.state));
  } catch { /* ignore */ }
}
function seenWelcome() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

export const sim = new Simulation(load());
// Handy in the browser console and for automated checks: __atrium.step(5), __atrium.state
(globalThis as unknown as { __atrium: Simulation }).__atrium = sim;

export type Selection = { kind: 'agent'; id: AgentId } | { kind: 'task'; id: string } | { kind: 'human' } | null;

interface UIState {
  rev: number;
  selected: Selection;
  follow: boolean;
  tab: 'tasks' | 'feed';
  dialog: 'welcome' | 'about' | null;
  cameraReset: number;
  leftOpen: boolean;
  select: (s: Selection, follow?: boolean) => void;
  setFollow: (f: boolean) => void;
  setTab: (t: 'tasks' | 'feed') => void;
  setDialog: (d: UIState['dialog']) => void;
  resetCamera: () => void;
  toggleLeft: () => void;
}

export const useUI = create<UIState>((set) => ({
  rev: 0,
  selected: null,
  follow: false,
  tab: 'tasks',
  dialog: seenWelcome() && sim.state.tasks.length > 0 ? null : 'welcome',
  cameraReset: 0,
  leftOpen: typeof innerWidth === 'undefined' || innerWidth > 900,
  select: (selected, follow) => set((s) => ({ selected, follow: selected ? follow ?? s.follow : false })),
  setFollow: (follow) => set({ follow }),
  setTab: (tab) => set({ tab }),
  setDialog: (dialog) => {
    if (dialog === null) try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
    set({ dialog });
  },
  resetCamera: () => set((s) => ({ cameraReset: s.cameraReset + 1, follow: false })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
}));

const bump = () => useUI.setState((s) => ({ rev: s.rev + 1 }));

/** Subscribe a component to simulation changes and get the current state. */
export function useSim(): SimState {
  useUI((s) => s.rev);
  return sim.state;
}

// Commands: thin wrappers so panels never touch the engine directly.
const run = <T,>(fn: () => T): T => {
  const r = fn();
  sim.dirty = false;
  bump();
  save();
  return r;
};
export const actions = {
  createTask: (templateId: string, title?: string) => run(() => sim.createTask(templateId, title)),
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
    useUI.setState({ selected: null, follow: false, dialog: 'welcome' });
  },
};

// Main loop.
let last = performance.now();
let lastPublish = 0;
let lastSave = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sim.step(dt);
  if (sim.dirty || now - lastPublish > 200) {
    sim.dirty = false;
    lastPublish = now;
    bump();
  }
  if (now - lastSave > 2000) {
    lastSave = now;
    save();
  }
  requestAnimationFrame(frame);
}
if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
