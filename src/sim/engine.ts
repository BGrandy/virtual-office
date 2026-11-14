// The orchestrator. A small deterministic state machine with no dependency on
// React, three.js or the browser. The UI only ever (a) reads `state` and
// (b) calls the command methods below.
//
// Stage work comes from one of two places:
//   - script mode: canned steps and outputs from data.ts, on fixed timers
//   - ai mode: a live model call made by the AI layer, delivered through `provideAI`
// Either way the ORCHESTRATOR decides what happens next. A model can suggest a
// priority, flag risk or ask for changes, but it can never skip review, approve
// its own work, or loop forever: those rules live here, not in a prompt.

import { AGENTS, AGENT_IDS, PRIORITY_NAME, SLA_REAL, STAGE_DURATION, STAGE_META, STAGE_OWNER, actorName, getTemplate, outputTitle, reviewWillFail, scriptFor, type StageScript } from './data';
import { AGENT_STATION, headingOf, station, type Station } from './layout';
import { dueAt } from './sla';
import type { Actor, AgentId, AgentState, AIStageResult, ApprovalPolicy, EventType, Handoff, SimState, StageSpan, Task, Vec2, WorkStage } from './types';

export const SAVE_VERSION = 5;
const WALK_SPEED = 3.4;
/** While waiting on a live model, the progress bar creeps up to here and holds. */
const AI_HOLD = 0.8;
/** The orchestrator allows one rework pass from the reviewer; after that it escalates to a person. */
const MAX_AGENT_REWORK = 1;

export function freshState(): SimState {
  const agents = {} as Record<AgentId, AgentState>;
  for (const id of AGENT_IDS) {
    const st = station(AGENT_STATION[id]);
    agents[id] = { id, pos: [...st.home] as Vec2, heading: headingOf(st.inward), activity: 'idle', path: [], stagesCompleted: 0, busy: 0 };
  }
  return { version: SAVE_VERSION, time: 0, speed: 1, paused: false, policy: 'risky', seq: 1, nextTicket: 1041, agents, tasks: [], events: [] };
}

export interface SimHooks {
  /** Called every tick while a live-AI stage has no result yet. The caller de-duplicates. */
  requestAI?: (task: Task, stage: WorkStage, key: string) => void;
}

const isAgent = (a: Actor): a is AgentId => a !== 'human';
export const aiKey = (t: Task, stage: WorkStage) => `${stage}:${t.rework}`;
const lastSpan = (t: Task): StageSpan | undefined => t.timeline[t.timeline.length - 1];

export class Simulation {
  state: SimState;
  hooks: SimHooks;
  /** Set whenever something discrete changed, so the UI knows to re-render. */
  dirty = true;

  constructor(saved?: SimState | null, hooks: SimHooks = {}) {
    this.state = saved && saved.version === SAVE_VERSION ? saved : freshState();
    this.hooks = hooks;
  }

  // ---------------------------------------------------------------- queries

  task(id?: string) {
    return id ? this.state.tasks.find((t) => t.id === id) : undefined;
  }

  /** Whether the orchestrator will stop this task for a person after review. */
  needsApproval(t: Task) {
    return getTemplate(t.templateId).risky || !!t.aiRisky || this.state.policy === 'all';
  }

  /**
   * Tasks waiting on an agent's desk, in the order the agent will take them:
   * earliest response-time deadline first, so urgent work jumps ahead but old
   * low-priority work is not starved forever. Held tasks go last and are skipped.
   */
  queueFor(id: AgentId) {
    return this.state.tasks
      .filter((t) => t.ownerId === id && t.status === 'queued')
      .sort((a, b) => Number(a.held) - Number(b.held) || dueAt(a) - dueAt(b) || a.createdAt - b.createdAt);
  }

  /** The steps and output for a stage: the live model's if it answered, otherwise the script. */
  stageScript(t: Task, stage: WorkStage): StageScript & { source: 'script' | 'ai' | 'fallback'; model?: string; ai?: AIStageResult } {
    if (t.mode === 'ai') {
      const r = t.ai[aiKey(t, stage)];
      if (r?.status === 'done') {
        return {
          steps: r.steps?.length ? r.steps : ['Working on it'],
          output: { title: outputTitle(t, stage, r.verdict), body: r.body ?? '' },
          source: 'ai', model: r.model, ai: r,
        };
      }
      if (r?.status === 'error') return { ...scriptFor(t, stage), source: 'fallback' };
    }
    return { ...scriptFor(t, stage), source: 'script' };
  }

  // --------------------------------------------------------------- commands

  createTask(templateId: string, customTitle?: string, mode: Task['mode'] = 'script'): Task {
    const s = this.state;
    const tpl = getTemplate(templateId);
    const n = s.nextTicket++;
    const t: Task = {
      id: `REQ-${n}`, templateId: tpl.id, title: customTitle?.trim() || tpl.title, requester: tpl.requester,
      priority: tpl.priority, colorIndex: n % 6, stage: 'triage', status: 'queued', ownerId: 'iris',
      progress: 0, held: false, rework: 0, history: [], outputs: [], createdAt: s.time,
      timeline: [{ stage: 'triage', owner: 'iris', arrived: s.time }], mode, ai: {},
    };
    s.tasks.push(t);
    this.log('created', `${t.requester} sent a new request: ${t.title}`, t.id);
    return t;
  }

  /** The AI layer hands back a model result (or an error) for one stage pass. */
  provideAI(taskId: string, key: string, result: AIStageResult) {
    const t = this.task(taskId);
    if (!t || t.mode !== 'ai') return;
    t.ai[key] = result;
    this.dirty = true;
  }

  approve(taskId: string, note = '') {
    const t = this.task(taskId);
    if (!t || t.status !== 'awaiting-approval') return;
    const to = STAGE_OWNER.delivery;
    t.outputs.push({ stage: 'approval', by: 'human', title: 'Approved by supervisor', body: note || 'Approved with no comment.', t: this.state.time, kind: 'ok', source: 'human' });
    t.history.push({ from: 'human', to, fromStage: 'approval', toStage: 'delivery', t: this.state.time, kind: 'approval', note: note || undefined });
    this.closeSpan(t);
    Object.assign(t, { stage: 'delivery', ownerId: to, status: 'queued', progress: 0 });
    t.timeline.push({ stage: 'delivery', owner: to, arrived: this.state.time });
    this.log('approved', `You approved ${t.id}. ${actorName(to)} will close it out.`, t.id, 'human');
  }

  reject(taskId: string, note = '') {
    const t = this.task(taskId);
    if (!t || t.status !== 'awaiting-approval') return;
    const to = STAGE_OWNER.execution;
    const text = note.trim() || 'Please revise before this goes out.';
    t.outputs.push({ stage: 'approval', by: 'human', title: 'Supervisor requested changes', body: text, t: this.state.time, kind: 'changes', source: 'human' });
    t.history.push({ from: 'human', to, fromStage: 'approval', toStage: 'execution', t: this.state.time, kind: 'rework', note: text });
    this.closeSpan(t);
    Object.assign(t, { stage: 'execution', ownerId: to, status: 'queued', progress: 0, rework: t.rework + 1, reworkBy: 'human', humanNote: text });
    t.timeline.push({ stage: 'execution', owner: to, arrived: this.state.time });
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
    this.closeSpan(t);
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
    const span = lastSpan(t);
    if (span) span.owner = to;
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
    for (const t of s.tasks) {
      if (!t.slaBreached && t.status !== 'done' && t.status !== 'cancelled' && s.time > dueAt(t)) {
        t.slaBreached = true;
        this.log('sla-breach', `${t.id} missed its ${SLA_REAL[t.priority]} response target (${PRIORITY_NAME[t.priority].toLowerCase()} priority).`, t.id);
      }
    }
  }

  private tickAgent(a: AgentState, dt: number) {
    if (a.activity !== 'idle') a.busy += dt;
    switch (a.activity) {
      case 'idle': {
        const next = this.queueFor(a.id).find((t) => !t.held);
        if (!next) return;
        next.status = 'active';
        a.taskId = next.id;
        a.activity = 'working';
        const span = lastSpan(next);
        if (span && span.started === undefined) span.started = this.state.time;
        a.say = this.sayFor(next, next.stage as WorkStage);
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

        // Live AI: hold at AI_HOLD until the model answers.
        if (t.mode === 'ai') {
          const key = aiKey(t, stage);
          let r = t.ai[key];
          if (!r) r = t.ai[key] = { status: 'pending' };
          if (r.status === 'pending') {
            this.hooks.requestAI?.(t, stage, key);
            t.progress = Math.min(AI_HOLD, t.progress + dt / STAGE_DURATION[stage]);
            const say = t.progress >= AI_HOLD ? `Thinking with ${r.model ?? 'the model'}` : this.sayFor(t, stage);
            if (a.say !== say) { a.say = say; this.dirty = true; }
            return;
          }
          if (r.status === 'error' && !r.logged) {
            r.logged = true;
            this.log('ai-error', `${AGENTS[a.id].name} could not reach the model (${r.error ?? 'unknown error'}). Using the scripted step instead.`, t.id, a.id);
          }
        }

        const script = this.stageScript(t, stage);
        const n = script.steps.length;
        const before = Math.floor(t.progress * n);
        t.progress = Math.min(1, t.progress + dt / STAGE_DURATION[stage]);
        const after = Math.floor(t.progress * n);
        if (after > before && after < n) {
          a.say = script.steps[after];
          this.log('step', `${AGENTS[a.id].name}: ${script.steps[after]}`, t.id, a.id);
        } else if (a.say?.startsWith('Thinking with')) {
          a.say = script.steps[Math.min(n - 1, after)];
          this.dirty = true;
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

  private sayFor(t: Task, stage: WorkStage) {
    const script = this.stageScript(t, stage);
    const i = Math.min(script.steps.length - 1, Math.floor(t.progress * script.steps.length));
    return script.steps[i];
  }

  private release(a: AgentState) {
    a.activity = 'idle';
    a.taskId = undefined;
    a.say = undefined;
    this.dirty = true;
  }

  private closeSpan(t: Task) {
    const span = lastSpan(t);
    if (span && span.finished === undefined) {
      span.started ??= span.arrived;
      span.finished = this.state.time;
    }
  }

  /** Stage work is finished: record the output and decide who gets the task next. */
  private finishStage(a: AgentState, t: Task, stage: WorkStage) {
    const s = this.state;
    const script = this.stageScript(t, stage);
    const ai = script.ai;

    // Apply what a live model is allowed to influence.
    if (ai && stage === 'triage' && ai.priority) t.priority = ai.priority;
    if (ai && stage === 'planning' && ai.risky) {
      t.aiRisky = true;
      t.riskReason = ai.riskReason || 'The planner flagged this work as risky';
    }

    let changes = false;
    let escalate: string | undefined;
    if (stage === 'review') {
      if (ai) {
        if (ai.verdict === 'escalate') escalate = 'The reviewer asked for a person to decide';
        else if (ai.verdict === 'changes') {
          if (t.rework < MAX_AGENT_REWORK) changes = true;
          else escalate = 'The reviewer was still not satisfied after one round of changes';
        }
      } else changes = reviewWillFail(t);
    }

    t.outputs.push({
      stage, by: a.id, title: script.output.title, body: script.output.body, t: s.time,
      kind: changes || escalate ? 'changes' : 'ok', source: script.source, model: script.model,
    });
    a.stagesCompleted++;
    this.closeSpan(t);
    this.log('output', `${AGENTS[a.id].name} finished: ${script.output.title}`, t.id, a.id);

    let next: NonNullable<Task['next']>;
    if (stage === 'triage') next = { stage: 'planning', ownerId: STAGE_OWNER.planning, kind: 'handoff' };
    else if (stage === 'planning') next = { stage: 'execution', ownerId: STAGE_OWNER.execution, kind: 'handoff' };
    else if (stage === 'execution') next = { stage: 'review', ownerId: STAGE_OWNER.review, kind: 'handoff' };
    else if (stage === 'review') {
      if (changes) next = { stage: 'execution', ownerId: STAGE_OWNER.execution, kind: 'rework', note: 'Reviewer requested changes' };
      else if (escalate || this.needsApproval(t)) {
        const reason = escalate ?? getTemplate(t.templateId).riskReason ?? t.riskReason ?? 'Your approval rule sends every task to you';
        t.riskReason = reason;
        next = { stage: 'approval', ownerId: 'human', kind: 'handoff', note: reason };
      } else next = { stage: 'delivery', ownerId: STAGE_OWNER.delivery, kind: 'handoff' };
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
    // Each agent has its own spot at a desk so two carriers never stand on the same point.
    const slot = next.stage === 'done' ? 0 : (AGENT_IDS.indexOf(a.id) - 2) * 0.42;
    const drop: Vec2 = [dest.visitor[0] + dest.tangent[0] * slot, dest.visitor[1] + dest.tangent[1] * slot];
    a.activity = 'carrying';
    a.path = [home.exit, home.gate, drop];
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
    t.timeline.push({ stage: next.stage, owner: h.to, arrived: s.time, ...(next.stage === 'done' ? { started: s.time, finished: s.time } : {}) });
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

  /**
   * Move along the path, steering around other agents. Returns true on arrival.
   * Steering: a short-range push away from nearby agents plus a "keep right" nudge,
   * so two agents meeting head-on pass each other instead of stalling.
   */
  private walk(a: AgentState, dt: number): boolean {
    let budget = WALK_SPEED * dt;
    let px = 0;
    let pz = 0;
    for (const id of AGENT_IDS) {
      if (id === a.id) continue;
      const b = this.state.agents[id];
      const dx = a.pos[0] - b.pos[0];
      const dz = a.pos[1] - b.pos[1];
      const d = Math.hypot(dx, dz);
      if (d > 1e-3 && d < 1.15) {
        const w = (1.15 - d) / 1.15;
        px += (dx / d) * w;
        pz += (dz / d) * w;
      }
    }
    const push = Math.hypot(px, pz);
    for (let i = 0; i < 8 && a.path.length && budget > 1e-6; i++) {
      const [tx, tz] = a.path[0];
      const dx = tx - a.pos[0];
      const dz = tz - a.pos[1];
      const dist = Math.hypot(dx, dz);
      const steer = push > 0.02 && dist > 0.6;
      if (!steer && dist <= budget) {
        if (dist > 1e-4) a.heading = Math.atan2(dx, dz);
        a.pos = [tx, tz];
        a.path.shift();
        budget -= dist;
        continue;
      }
      let ux = dx / dist;
      let uz = dz / dist;
      if (steer) {
        // (uz, -ux) is the walker's right-hand side in this x/z frame.
        const nx = ux + px * 1.2 + uz * push * 0.9;
        const nz = uz + pz * 1.2 - ux * push * 0.9;
        const l = Math.hypot(nx, nz) || 1;
        ux = nx / l;
        uz = nz / l;
      }
      const move = Math.min(budget, dist);
      a.pos = [a.pos[0] + ux * move, a.pos[1] + uz * move];
      a.heading = Math.atan2(ux, uz);
      budget = 0;
    }
    return a.path.length === 0;
  }

  private log(type: EventType, text: string, taskId?: string, actor?: Actor) {
    const s = this.state;
    s.events.push({ id: s.seq++, t: s.time, type, text, taskId, actor });
    if (s.events.length > 500) s.events.splice(0, s.events.length - 500);
    this.dirty = true;
  }
}
