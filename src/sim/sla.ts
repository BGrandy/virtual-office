// Response-time targets. Pure functions shared by the engine, dashboard and UI.

import { SLA_TARGET } from './data';
import type { Task } from './types';

export type SlaState = 'on-track' | 'at-risk' | 'breached' | 'met' | 'missed';

export interface SlaInfo {
  state: SlaState;
  target: number;
  due: number;
  /** Seconds left (negative once late). For closed requests, the margin at completion. */
  remaining: number;
}

/** A request is "at risk" in the last quarter of its target. */
const AT_RISK_SHARE = 0.25;

/** Deadline. Time spent waiting for a live model's answer pushes it back, so network latency is never "late". */
export const dueAt = (t: Task) => t.createdAt + SLA_TARGET[t.priority] + (t.aiWait ?? 0);

export function slaInfo(t: Task, now: number): SlaInfo | null {
  if (t.status === 'cancelled') return null;
  const target = SLA_TARGET[t.priority] + (t.aiWait ?? 0);
  const due = dueAt(t);
  if (t.status === 'done') {
    const remaining = due - (t.completedAt ?? now);
    return { state: remaining >= 0 ? 'met' : 'missed', target, due, remaining };
  }
  const remaining = due - now;
  const state: SlaState = remaining < 0 ? 'breached' : remaining < target * AT_RISK_SHARE ? 'at-risk' : 'on-track';
  return { state, target, due, remaining };
}
