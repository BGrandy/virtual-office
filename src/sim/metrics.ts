// Team performance figures for the dashboard, computed from engine state only.
// Pure functions, so they are unit-tested and would run unchanged on a server.

import { AGENTS, AGENT_IDS, PIPELINE, PRIORITY_NAME, SLA_REAL, STAGE_META, STAGE_OWNER, actorName } from './data';
import { slaInfo, type SlaInfo } from './sla';
import type { AgentId, SimState, Stage, Task, WorkStage } from './types';

export interface StageStat {
  stage: Stage;
  label: string;
  owner: string;
  /** Average seconds a request waited before work started (in a tray, or for you). */
  wait: number;
  /** Average seconds of actual work. */
  work: number;
  samples: number;
}

export interface AgentStat {
  id: AgentId;
  name: string;
  /** Share of time since the first request that the agent was busy, 0..1. */
  utilisation: number;
  queued: number;
  /** Seconds the oldest request in the tray has been waiting. */
  oldestWait: number;
}

export interface Metrics {
  created: number;
  open: number;
  completed: number;
  cancelled: number;
  avgCycle: number;
  /** Share of completed requests that closed without any supervisor action. */
  autonomy: number;
  /** Share of requests that passed review at least once and were sent back at least once. */
  reworkRate: number;
  stages: StageStat[];
  agents: AgentStat[];
  human: { approvals: number; changes: number; holds: number; reassigns: number; cancels: number; waiting: number };
  /** Share of completed requests closed within their response-time target. */
  slaMet: number;
  /** Open requests that are at risk or already late, most urgent first. */
  slaAlerts: { task: Task; sla: SlaInfo }[];
  insight: string;
}

const touchedByHuman = (t: Task) => t.history.some((h) => h.from === 'human' || h.kind === 'reassign') || t.outputs.some((o) => o.by === 'human') || t.held;

/** Estimated cost of every live model call made for this request. */
export const aiCost = (t: Task) => Object.values(t.ai).reduce((n, r) => n + (r.cost ?? 0), 0);
export const aiCalls = (t: Task) => Object.values(t.ai).filter((r) => r.cost !== undefined).length;

export function computeMetrics(s: SimState): Metrics {
  const tasks = s.tasks;
  const done = tasks.filter((t) => t.status === 'done');
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const avgCycle = done.length ? done.reduce((n, t) => n + (t.completedAt! - t.createdAt), 0) / done.length : 0;
  const autonomy = done.length ? done.filter((t) => !touchedByHuman(t) && !t.history.some((h) => h.kind === 'approval')).length / done.length : 0;
  const reviewed = tasks.filter((t) => t.outputs.some((o) => o.stage === 'review'));
  const reworkRate = reviewed.length ? reviewed.filter((t) => t.rework > 0).length / reviewed.length : 0;

  const stages: StageStat[] = PIPELINE.map((stage) => {
    let wait = 0;
    let work = 0;
    let n = 0;
    for (const t of tasks) {
      for (const sp of t.timeline) {
        if (sp.stage !== stage || sp.finished === undefined) continue;
        const started = sp.started ?? sp.arrived;
        if (stage === 'approval') wait += sp.finished - sp.arrived;
        else {
          wait += started - sp.arrived;
          work += sp.finished - started;
        }
        n++;
      }
    }
    const owner = stage === 'approval' ? 'You' : actorName(STAGE_OWNER[stage as WorkStage]);
    return { stage, label: STAGE_META[stage].label, owner, wait: n ? wait / n : 0, work: n ? work / n : 0, samples: n };
  });

  const firstAt = tasks.length ? Math.min(...tasks.map((t) => t.createdAt)) : s.time;
  const span = Math.max(1, s.time - firstAt);
  const agents: AgentStat[] = AGENT_IDS.map((id) => {
    const q = tasks.filter((t) => t.ownerId === id && t.status === 'queued' && !t.held);
    const oldest = q.reduce((m, t) => {
      const sp = t.timeline[t.timeline.length - 1];
      return Math.max(m, sp ? s.time - sp.arrived : 0);
    }, 0);
    return { id, name: AGENTS[id].name, utilisation: Math.min(1, s.agents[id].busy / span), queued: q.length, oldestWait: oldest };
  });

  const count = (type: string) => s.events.filter((e) => e.type === type).length;
  const human = {
    approvals: count('approved'), changes: count('rejected'), holds: count('held'), reassigns: count('reassigned'), cancels: count('cancelled'),
    waiting: tasks.filter((t) => t.status === 'awaiting-approval').length,
  };

  const slaMet = done.length ? done.filter((t) => slaInfo(t, s.time)?.state === 'met').length / done.length : 0;
  const slaAlerts = open
    .map((task) => ({ task, sla: slaInfo(task, s.time)! }))
    .filter((x) => x.sla && (x.sla.state === 'at-risk' || x.sla.state === 'breached'))
    .sort((a, b) => a.sla.remaining - b.sla.remaining);

  return {
    created: tasks.length, open: open.length, completed: done.length, cancelled: tasks.filter((t) => t.status === 'cancelled').length,
    avgCycle, autonomy, reworkRate, stages, agents, human, slaMet, slaAlerts,
    insight: slaInsight(slaAlerts) ?? insightFor(stages, agents, done.length, human.waiting),
  };
}

/** Where a request is, in words, for the recommendation sentence. */
function whereIs(t: Task) {
  if (t.status === 'awaiting-approval') return 'waiting for your approval';
  if (t.held) return 'on hold';
  if (t.status === 'queued') return `waiting in ${actorName(t.ownerId)}'s tray`;
  if (t.status === 'handoff') return 'being handed on';
  return `with ${actorName(t.ownerId)}`;
}

/** A request about to miss (or already past) its target outranks every other recommendation. */
export function slaInsight(alerts: { task: Task; sla: SlaInfo }[]): string | undefined {
  const first = alerts[0];
  if (!first) return undefined;
  const { task: t, sla } = first;
  const what = `${t.id} (${PRIORITY_NAME[t.priority].toLowerCase()})`;
  const action =
    t.status === 'awaiting-approval' ? 'Decide on it now.'
    : t.held ? 'Resume it if it can go ahead.'
    : t.status === 'queued' ? `Give this step to a free agent, or hold less urgent work at that desk.`
    : 'It is being worked on; keep an eye on it.';
  const more = alerts.length > 1 ? ` ${alerts.length - 1} more ${alerts.length === 2 ? 'request is' : 'requests are'} close behind.` : '';
  if (sla.state === 'breached') return `${what} has missed its ${SLA_REAL[t.priority]} target and is ${whereIs(t)}. ${action}${more}`;
  return `${what} is due in ${secs(sla.remaining)} and is ${whereIs(t)}. ${action}${more}`;
}

// ------------------------------------------------------------------ business value

export interface ValueAssumptions {
  /** Minutes a technician spends on a typical request handled entirely by hand. */
  manualMinutes: number;
  /** Minutes of a person's time each time they step in (approve, send back, reassign, hold). */
  touchMinutes: number;
  /** Fully loaded cost of an hour of IT staff time. */
  hourlyCost: number;
  /** Requests the desk handles on a working day. */
  requestsPerDay: number;
}

export const DEFAULT_VALUE: ValueAssumptions = { manualMinutes: 25, touchMinutes: 4, hourlyCost: 45, requestsPerDay: 40 };
const WORKING_DAYS_PER_MONTH = 21;

export interface ValueEstimate {
  completed: number;
  /** Times a person stepped in on the completed requests. */
  touches: number;
  /** Average minutes of human time per request with Atrium. */
  humanMinutesPerRequest: number;
  /** Minutes saved per request compared with doing it by hand. */
  savedMinutesPerRequest: number;
  /** Hours saved across the requests completed in this run. */
  savedHoursRun: number;
  monthlyHours: number;
  monthlyCost: number;
}

/** Converts this run's mix of requests into time and cost saved. An estimate from the assumptions, not a measurement. */
export function valueEstimate(s: SimState, a: ValueAssumptions): ValueEstimate | null {
  const done = new Set(s.tasks.filter((t) => t.status === 'done').map((t) => t.id));
  if (!done.size) return null;
  const touches = s.events.filter((e) => e.actor === 'human' && e.taskId && done.has(e.taskId) && ['approved', 'rejected', 'held', 'reassigned'].includes(e.type)).length;
  const humanMinutesPerRequest = (touches * a.touchMinutes) / done.size;
  const savedMinutesPerRequest = Math.max(0, a.manualMinutes - humanMinutesPerRequest);
  const monthlyHours = (a.requestsPerDay * WORKING_DAYS_PER_MONTH * savedMinutesPerRequest) / 60;
  return {
    completed: done.size,
    touches,
    humanMinutesPerRequest,
    savedMinutesPerRequest,
    savedHoursRun: (done.size * savedMinutesPerRequest) / 60,
    monthlyHours,
    monthlyCost: monthlyHours * a.hourlyCost,
  };
}

const secs = (n: number) => `${Math.round(n)}s`;
/** How each step is named in a sentence. */
const WORK: Record<Stage, string> = { triage: 'triage', planning: 'planning', execution: 'the work', review: 'review', approval: 'approval', delivery: 'the reply', done: '' };
const STEP_NAME: Record<Stage, string> = { triage: 'Triage', planning: 'Planning', execution: 'Doing the work', review: 'Review', approval: 'Approval', delivery: 'Writing the reply', done: '' };
const ROLE = (stage: Stage) => (stage === 'approval' || stage === 'done' ? '' : AGENTS[STAGE_OWNER[stage as WorkStage]].role.toLowerCase());

/** One plain-language sentence on where to act first. Rules, not AI. */
export function insightFor(stages: StageStat[], agents: AgentStat[], completed: number, waiting: number): string {
  const pile = [...agents].sort((a, b) => b.queued - a.queued)[0];
  if (pile && pile.queued >= 3) {
    return `${pile.queued} requests are waiting for ${pile.name} right now, the oldest for ${secs(pile.oldestWait)}. Give some of that step to a quieter agent from the request's details panel.`;
  }
  if (waiting >= 2 || (waiting === 1 && !completed)) {
    const n = waiting === 1 ? '1 request is' : `${waiting} requests are`;
    return `${n} stopped at your console with every other step done. Approving is the fastest way to move work forward.`;
  }
  if (!completed) return 'Complete a request to see where the time goes.';
  const parts = stages.filter((s) => s.samples).flatMap((s) => [
    { what: 'wait', s, v: s.wait },
    { what: 'work', s, v: s.work },
  ]);
  const total = parts.reduce((n, p) => n + p.v, 0) || 1;
  const top = parts.sort((a, b) => b.v - a.v)[0];
  const pct = Math.round((top.v / total) * 100);
  if (top.s.stage === 'approval') {
    return `Waiting for your approval is the biggest share of each request's time (${pct}%). Approving sooner, or letting agents close more types of low-risk work, would cut cycle time the most.`;
  }
  if (top.what === 'wait') {
    return `Requests spend the most time (${pct}%) waiting for ${top.s.owner} to start ${WORK[top.s.stage]}. That desk is the bottleneck: reassign some of its work, or add another ${ROLE(top.s.stage)} agent.`;
  }
  return `${STEP_NAME[top.s.stage]} takes the longest (${pct}% of each request's time, done by ${top.s.owner}). A faster model or a better runbook for that step pays off most.`;
}
