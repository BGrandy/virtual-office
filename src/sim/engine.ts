// The orchestrator. A small deterministic state machine with no dependency on
// React, three.js or the browser. The UI only ever (a) reads `state` and
// (b) calls the command methods below. In production this class is what moves
// to a server: same state shape, same commands, real model calls instead of timers.

import { AGENTS, AGENT_IDS, STAGE_DURATION, STAGE_META, STAGE_OWNER, actorName, getTemplate, reviewWillFail, scriptFor } from './data';
import { AGENT_STATION, STATIONS, headingOf, station, type Station } from './layout';
import type { Actor, AgentId, AgentState, ApprovalPolicy, EventType, Handoff, SimState, Stage, Task, Vec2, WorkStage } from './types';

export const SAVE_VERSION = 4;
const WALK_SPEED = 3.4;
const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2 } as const;

export function freshState(): SimState {
  const agents = {} as Record<AgentId, AgentState>;
  for (const id of AGENT_IDS) {
    const st = station(AGENT_STATION[id]);
    agents[id] = { id, pos: [...st.home] as Vec2, heading: headingOf(st.inward), activity: 'idle', path: [], stagesCompleted: 0 };
  }
  return { version: SAVE_VERSION, time: 0, speed: 1, paused: false, policy: 'risky', seq: 1, nextTicket: 1041, agents, tasks: [], events: [] };
}

const isAgent = (a: Actor): a is AgentId => a !== 'human';

export class Simulation {
  state: SimState;
  /** Set whenever something discrete changed, so the UI knows to re-render. */
  dirty = true;

  constructor(saved?: SimState | null) {
    this.state = saved && saved.version === SAVE_VERSION ? saved : freshState();
  }

  // ---------------------------------------------------------------- queries

  task(id?: string) {
    return id ? this.state.tasks.find((t) => t.id === id) : undefined;
  }

  needsApproval(t: Task) {
    return getTemplate(t.templateId).risky || this.state.policy === 'all';
  }

  /** Tasks waiting on an agent's desk, in the order the agent will take them. */
  queueFor(id: AgentId) {
    return this.state.tasks
      .filter((t) => t.ownerId === id && t.status === 'queued')
      .sort((a, b) => Number(a.held) - Number(b.held) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt);
  }

  // --------------------------------------------------------------- commands

  createTask(templateId: string, customTitle?: string): Task {
    const s = this.state;
    const tpl = getTemplate(templateId);
    const n = s.nextTicket++;
    const t: Task = {
      id: `REQ-${n}`, templateId: tpl.id, title: customTitle?.trim() || tpl.title, requester: tpl.requester,
      priority: tpl.priority, colorIndex: n % 6, stage: 'triage', status: 'queued', ownerId: 'iris',
      progress: 0, held: false, rework: 0, history: [], outputs: [], createdAt: s.time,
    };
    s.tasks.push(t);
    this.log('created', `${t.requester} sent a new request: ${t.title}`, t.id);
    return t;
  }

  approve(taskId: string, note = '') {
    const t = this.task(taskId);
    if (!t || t.status !== 'awaiting-approval') return;
    const to = STAGE_OWNER.delivery;
    t.outputs.push({ stage: 'approval', by: 'human', title: 'Approved by supervisor', body: note || 'Approved with no comment.', t: this.state.time, kind: 'ok' });
    t.history.push({ from: 'human', to, fromStage: 'approval', toStage: 'delivery', t: this.state.time, kind: 'approval', note: note || undefined });
    Object.assign(t, { stage: 'delivery', ownerId: to, status: 'queued', progress: 0 });
    this.log('approved', `You approved ${t.id}. ${actorName(to)} will close it out.`, t.id, 'human');
  }

  reject(taskId: string, note = '') {
    const t = this.task(taskId);
    if (!t || t.status !== 'awaiting-approval') return;
    const to = STAGE_OWNER.execution;
    const text = note.trim() || 'Please revise before this goes out.';
    t.outputs.push({ stage: 'approval', by: 'human', title: 'Supervisor requested changes', body: text, t: this.state.time, kind: 'changes' });
    t.history.push({ from: 'human', to, fromStage: 'approval', toStage: 'execution', t: this.state.time, kind: 'rework', note: text });
    Object.assign(t, { stage: 'execution', ownerId: to, status: 'queued', progress: 0, rework: t.rework + 1, reworkBy: 'human', humanNote: text });
    this.log('rejected', `You sent ${t.id} back to ${actorName(to)}: ${text}`, t.id, 'human');
  }

  setHeld(taskId: string, held: boolean) {
    const t = this.task(taskId);
    if (!t || t.status === 'done' || t.status === 'cancelled' || t.held === held) return;
    t.held = held;
    this.log(held ? 'held' : 'resumed', held ? `You put ${t.id} on hold. Agents will skip it.` : `You resumed ${t.id}.`, t.id, 'human');
  }

  cancel(taskId: string) {
    const t = this.task(taskId);
    if (!t || t.status === 'done' || t.status === 'cancelled') return;
    t.status = 'cancelled';
    t.completedAt = this.state.time;
    this.log('cancelled', `You cancelled ${t.id}.`, t.id, 'human');
  }

  /** Give the current stage of a task to a different agent. */
  reassign(taskId: string, to: AgentId) {
    const t = this.task(taskId);
    if (!t || !isAgent(t.ownerId) || t.ownerId === to || (t.status !== 'queued' && t.status !== 'active')) return;
    const from = t.ownerId;
    t.history.push({ from, to, fromStage: t.stage, toStage: t.stage, t: this.state.time, kind: 'reassign', note: 'Reassigned by supervisor' });
    t.ownerId = to;
    t.status = 'queued'; // the previous owner notices on its next tick and lets go
    this.log('reassigned', `You moved ${t.id} from ${actorName(from)} to ${actorName(to)}.`, t.id, 'human');
  }

  setPolicy(policy: ApprovalPolicy) {
    if (this.state.policy === policy) return;
    this.state.policy = policy;
    this.log('policy', policy === 'all' ? 'Approval rule changed: every task now stops for you.' : 'Approval rule changed: only risky work stops for you.', undefined, 'human');
  }

  setSpeed(speed: number) { this.state.speed = speed; this.dirty = true; }
  setPaused(paused: boolean) { this.state.paused = paused; this.dirty = true; }
  reset() { this.state = freshState(); this.dirty = true; }

  // ------------------------------------------------------------------- tick

  /** Advance the simulation by `dt` real seconds. */
  step(dt: number) {
    const s = this.state;
    if (s.paused) return;
    const d = dt * s.speed;
    s.time += d;
    for (const id of AGENT_IDS) this.tickAgent(s.agents[id], d);
  }

  private tickAgent(a: AgentState, dt: number) {
    switch (a.activity) {
      case 'idle': {
        const next = this.queueFor(a.id).find((t) => !t.held);
        if (!next) return;
        next.status = 'active';
        a.taskId = next.id;
        a.activity = 'working';
        const script = scriptFor(next, next.stage as WorkStage);
        const i = Math.min(script.steps.length - 1, Math.floor(next.progress * script.steps.length));
        a.say = script.steps[i];
        this.log('started', `${AGENTS[a.id].name} picked up ${next.id} (${STAGE_META[next.stage].label.toLowerCase()} stage)`, next.id, a.id);
        return;
      }
      case 'working': {
        const t = this.task(a.taskId);
        // Let go if the supervisor intervened (hold, cancel, reassign).
        if (!t || t.status !== 'active' || t.ownerId !== a.id || t.held) {
          if (t && t.status === 'active' && t.ownerId === a.id) t.status = 'queued';
          this.release(a);
          return;
        }
        const stage = t.stage as WorkStage;
        const script = scriptFor(t, stage);
        const n = script.steps.length;
        const before = Math.floor(t.progress * n);
        t.progress = Math.min(1, t.progress + dt / STAGE_DURATION[stage]);
        const after = Math.floor(t.progress * n);
        if (after > before && after < n) {
          a.say = script.steps[after];
          this.log('step', `${AGENTS[a.id].name}: ${script.steps[after]}`, t.id, a.id);
        }
        if (t.progress >= 1) this.finishStage(a, t, stage);
        return;
      }
      case 'carrying':
      case 'returning': {
        if (!this.walk(a, dt)) return;
        if (a.activity === 'carrying') {
          const t = this.task(a.taskId);
          if (t && t.status === 'handoff') this.deliver(a, t);
          const home = station(AGENT_STATION[a.id]);
          a.taskId = undefined;
          a.say = undefined;
          a.activity = 'returning';
          a.path = [home.gate, home.exit, home.home];
        } else {
          a.activity = 'idle';
          a.heading = headingOf(station(AGENT_STATION[a.id]).inward);
        }
        this.dirty = true;
        return;
      }
    }
  }

  private release(a: AgentState) {
    a.activity = 'idle';
    a.taskId = undefined;
    a.say = undefined;
    this.dirty = true;
  }

  /** Stage work is finished: record the output and decide who gets the task next. */
  private finishStage(a: AgentState, t: Task, stage: WorkStage) {
    const s = this.state;
    const script = scriptFor(t, stage);
    const failed = stage === 'review' && reviewWillFail(t);
    t.outputs.push({ stage, by: a.id, title: script.output.title, body: script.output.body, t: s.time, kind: failed ? 'changes' : 'ok' });
    a.stagesCompleted++;
    this.log('output', `${AGENTS[a.id].name} finished: ${script.output.title}`, t.id, a.id);

    let next: NonNullable<Task['next']>;
    if (stage === 'triage') next = { stage: 'planning', ownerId: STAGE_OWNER.planning, kind: 'handoff' };
    else if (stage === 'planning') next = { stage: 'execution', ownerId: STAGE_OWNER.execution, kind: 'handoff' };
    else if (stage === 'execution') next = { stage: 'review', ownerId: STAGE_OWNER.review, kind: 'handoff' };
    else if (stage === 'review') {
      if (failed) next = { stage: 'execution', ownerId: STAGE_OWNER.execution, kind: 'rework', note: 'Reviewer requested changes' };
      else if (this.needsApproval(t)) next = { stage: 'approval', ownerId: 'human', kind: 'handoff', note: getTemplate(t.templateId).riskReason ?? 'Approval rule: every task' };
      else next = { stage: 'delivery', ownerId: STAGE_OWNER.delivery, kind: 'handoff' };
    } else next = { stage: 'done', ownerId: a.id, kind: 'handoff' };

    t.next = next;
    t.status = 'handoff';

    // Nobody to walk to if the same agent owns the next stage.
    if (next.stage !== 'done' && next.ownerId === a.id) {
      this.deliver(a, t);
      this.release(a);
      return;
    }
    const home = station(AGENT_STATION[a.id]);
    const dest = this.destination(next);
    a.activity = 'carrying';
    a.path = [home.exit, home.gate, dest.visitor];
    a.say = next.stage === 'done' ? 'Filing as completed' : next.kind === 'rework' ? `Sending back to ${actorName(next.ownerId)}` : next.ownerId === 'human' ? 'Taking this to the supervisor' : `Handing off to ${actorName(next.ownerId)}`;
  }

  private destination(next: NonNullable<Task['next']>): Station {
    if (next.stage === 'done') return station('archive');
    if (next.ownerId === 'human') return station('approval');
    return station(AGENT_STATION[next.ownerId]);
  }

  /** The carrier has arrived: ownership actually changes here. */
  private deliver(a: AgentState, t: Task) {
    const s = this.state;
    const next = t.next!;
    const h: Handoff = { from: a.id, to: next.stage === 'done' ? 'archive' : next.ownerId, fromStage: t.stage, toStage: next.stage, t: s.time, kind: next.kind, note: next.note };
    t.history.push(h);
    const fromLabel = STAGE_META[t.stage].label;
    t.stage = next.stage;
    t.progress = 0;
    t.next = undefined;
    if (next.stage === 'done') {
      t.status = 'done';
      t.completedAt = s.time;
      this.log('completed', `${t.id} is complete. ${AGENTS[a.id].name} filed it in the archive.`, t.id, a.id);
    } else if (next.ownerId === 'human') {
      t.ownerId = 'human';
      t.status = 'awaiting-approval';
      this.log('approval-requested', `${t.id} needs your approval: ${next.note}`, t.id, a.id);
    } else {
      t.ownerId = next.ownerId;
      t.status = 'queued';
      if (next.kind === 'rework') {
        t.rework++;
        t.reworkBy = a.id;
        this.log('rework', `${AGENTS[a.id].name} sent ${t.id} back to ${actorName(next.ownerId)} for changes`, t.id, a.id);
      } else {
        this.log('handoff', `${AGENTS[a.id].name} handed ${t.id} to ${actorName(next.ownerId)} (${fromLabel} to ${STAGE_META[next.stage].label})`, t.id, a.id);
      }
    }
  }

  /** Move along the path. Returns true on arrival at the final point. */
  private walk(a: AgentState, dt: number): boolean {
    let budget = WALK_SPEED * dt;
    while (a.path.length && budget > 0) {
      const [tx, tz] = a.path[0];
      const dx = tx - a.pos[0];
      const dz = tz - a.pos[1];
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4) a.heading = Math.atan2(dx, dz);
      if (dist <= budget) {
        a.pos = [tx, tz];
        a.path.shift();
        budget -= dist;
      } else {
        a.pos = [a.pos[0] + (dx / dist) * budget, a.pos[1] + (dz / dist) * budget];
        budget = 0;
      }
    }
    return a.path.length === 0;
  }

  private log(type: EventType, text: string, taskId?: string, actor?: Actor) {
    const s = this.state;
    s.events.push({ id: s.seq++, t: s.time, type, text, taskId, actor });
    if (s.events.length > 400) s.events.splice(0, s.events.length - 400);
    this.dirty = true;
  }
}

export { STATIONS };
export type { Stage };
