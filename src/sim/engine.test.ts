import { describe, expect, it } from 'vitest';
import { Simulation } from './engine';
import { BUSY_MORNING } from './data';
import type { AIStageResult, Task, WorkStage } from './types';

/** Run the simulation until `until` is true, failing if it takes too long. */
function run(sim: Simulation, until: () => boolean, maxSeconds = 600) {
  for (let i = 0; i < maxSeconds * 10; i++) {
    if (until()) return;
    sim.step(0.1);
  }
  throw new Error('Simulation did not reach the expected state in time');
}
const stagesVisited = (t: Task) => t.history.filter((h) => h.kind !== 'reassign').map((h) => h.toStage);

describe('workflow engine', () => {
  it('runs a low-risk task end to end without stopping for a person', () => {
    const sim = new Simulation();
    const t = sim.createTask('lockout');
    run(sim, () => t.status === 'done');
    expect(stagesVisited(t)).toEqual(['planning', 'execution', 'review', 'delivery', 'done']);
    expect(t.history.map((h) => h.from)).toEqual(['iris', 'atlas', 'bolt', 'sage', 'echo']);
    expect(t.outputs).toHaveLength(5);
  });

  it('stops risky work at the approval gate until the supervisor approves', () => {
    const sim = new Simulation();
    const t = sim.createTask('onboarding');
    run(sim, () => t.status === 'awaiting-approval');
    expect(t.ownerId).toBe('human');
    for (let i = 0; i < 300; i++) sim.step(0.1); // nothing moves while we wait
    expect(t.status).toBe('awaiting-approval');
    sim.approve(t.id, 'Looks right');
    run(sim, () => t.status === 'done');
    expect(stagesVisited(t)).toContain('approval');
  });

  it('sends work back to the technician when the supervisor requests changes', () => {
    const sim = new Simulation();
    const t = sim.createTask('vpn');
    run(sim, () => t.status === 'awaiting-approval');
    sim.reject(t.id, 'Add a rollback window');
    expect(t.stage).toBe('execution');
    expect(t.ownerId).toBe('bolt');
    run(sim, () => t.status === 'awaiting-approval');
    expect(t.outputs.some((o) => o.body.includes('Add a rollback window'))).toBe(true);
    sim.approve(t.id);
    run(sim, () => t.status === 'done');
  });

  it('loops through rework once when the reviewer finds a gap', () => {
    const sim = new Simulation();
    const t = sim.createTask('phishing');
    run(sim, () => t.status === 'done');
    expect(t.rework).toBe(1);
    expect(stagesVisited(t)).toEqual(['planning', 'execution', 'review', 'execution', 'review', 'delivery', 'done']);
    expect(t.outputs.filter((o) => o.kind === 'changes')).toHaveLength(1);
  });

  it('gates every task when the approval rule is set to "all"', () => {
    const sim = new Simulation();
    sim.setPolicy('all');
    const t = sim.createTask('lockout');
    run(sim, () => t.status === 'awaiting-approval');
    expect(t.stage).toBe('approval');
  });

  it('skips held tasks and picks them up again on resume', () => {
    const sim = new Simulation();
    const t = sim.createTask('lockout');
    run(sim, () => t.stage === 'execution' && t.status === 'active');
    sim.setHeld(t.id, true);
    for (let i = 0; i < 300; i++) sim.step(0.1);
    expect(t.stage).toBe('execution');
    expect(sim.state.agents.bolt.activity).toBe('idle');
    sim.setHeld(t.id, false);
    run(sim, () => t.status === 'done');
  });

  it('lets the supervisor reassign the current stage to another agent', () => {
    const sim = new Simulation();
    const t = sim.createTask('lockout');
    run(sim, () => t.stage === 'execution' && t.status === 'active');
    sim.reassign(t.id, 'atlas');
    run(sim, () => t.stage === 'review');
    expect(t.outputs.find((o) => o.stage === 'execution')?.by).toBe('atlas');
    run(sim, () => t.status === 'done');
  });

  it('takes urgent work first when several tasks are waiting', () => {
    const sim = new Simulation();
    sim.createTask('lockout'); // P3, picked up immediately
    const low = sim.createTask('lockout'); // P3
    const urgent = sim.createTask('vpn'); // P1, created last
    run(sim, () => urgent.stage !== 'triage' || low.stage !== 'triage');
    expect(urgent.stage).toBe('planning');
    expect(low.stage).toBe('triage');
  });

  it('cancels cleanly and frees the agent', () => {
    const sim = new Simulation();
    const t = sim.createTask('lockout');
    run(sim, () => t.status === 'active');
    sim.cancel(t.id);
    sim.step(0.1);
    expect(t.status).toBe('cancelled');
    expect(sim.state.agents.iris.activity).toBe('idle');
  });

  it('keeps state serialisable so it can be saved and restored mid-task', () => {
    const sim = new Simulation();
    const t = sim.createTask('lockout');
    run(sim, () => t.status === 'handoff');
    const restored = new Simulation(JSON.parse(JSON.stringify(sim.state)));
    const t2 = restored.task(t.id)!;
    run(restored, () => t2.status === 'done');
    expect(t2.outputs).toHaveLength(5);
  });
});

// ---------------------------------------------------------------- live AI path
// A fake model stands in for the network so the orchestration rules can be tested exactly.

type Fake = Partial<Record<WorkStage, Partial<AIStageResult>[]>>;
function withFakeModel(fake: Fake, delayTicks = 3) {
  const pending: { id: string; key: string; stage: WorkStage; due: number }[] = [];
  const seen = new Set<string>();
  const calls: string[] = [];
  let tick = 0;
  const sim = new Simulation(null, {
    requestAI: (t, stage, key) => {
      if (seen.has(t.id + key)) return;
      seen.add(t.id + key);
      calls.push(`${t.id}:${key}`);
      pending.push({ id: t.id, key, stage, due: tick + delayTicks });
    },
  });
  const step = sim.step.bind(sim);
  sim.step = (dt: number) => {
    tick++;
    for (const p of pending.filter((x) => x.due <= tick)) {
      pending.splice(pending.indexOf(p), 1);
      const list = fake[p.stage] ?? [{}];
      const n = calls.filter((c) => c.startsWith(p.id) && c.includes(`:${p.stage}:`)).length - 1;
      const r = list[Math.min(n, list.length - 1)];
      sim.provideAI(p.id, p.key, { status: 'done', steps: ['Step one', 'Step two'], body: `${p.stage} by model`, model: 'Fake 1', ...r });
    }
    step(dt);
  };
  return { sim, calls };
}

describe('live AI orchestration', () => {
  it('waits for the model, then uses its output and labels it', () => {
    const { sim, calls } = withFakeModel({}, 40);
    const t = sim.createTask('custom', 'Printer on floor 2 is offline', 'ai');
    run(sim, () => t.status === 'done');
    expect(calls).toHaveLength(5);
    expect(t.outputs.every((o) => o.source === 'ai' && o.model === 'Fake 1')).toBe(true);
    expect(t.outputs[0].body).toBe('triage by model');
  });

  it('lets the model set priority and flag risk, but the orchestrator enforces the gate', () => {
    const { sim } = withFakeModel({ triage: [{ priority: 'P1' }], planning: [{ risky: true, riskReason: 'Changes a server' }] });
    const t = sim.createTask('custom', 'Reboot the file server', 'ai');
    run(sim, () => t.status === 'awaiting-approval');
    expect(t.priority).toBe('P1');
    expect(t.riskReason).toBe('Changes a server');
  });

  it('allows one reviewer rework, then escalates to a person instead of looping', () => {
    const { sim } = withFakeModel({ review: [{ verdict: 'changes' }, { verdict: 'changes' }] });
    const t = sim.createTask('custom', 'Set up shared mailbox', 'ai');
    run(sim, () => t.status === 'awaiting-approval');
    expect(t.rework).toBe(1);
    expect(t.riskReason).toMatch(/still not satisfied/);
  });

  it('a model "pass" cannot skip the approval gate on risky work', () => {
    const { sim } = withFakeModel({ review: [{ verdict: 'pass' }] });
    const t = sim.createTask('vpn', undefined, 'ai');
    run(sim, () => t.status === 'awaiting-approval');
    expect(t.stage).toBe('approval');
  });

  it('falls back to the script, and says so, when the model call fails', () => {
    const sim = new Simulation(null, { requestAI: (t, _s, key) => sim.provideAI(t.id, key, { status: 'error', error: 'HTTP 401' }) });
    const t = sim.createTask('lockout', undefined, 'ai');
    run(sim, () => t.status === 'done');
    expect(t.outputs.every((o) => o.source === 'fallback')).toBe(true);
    expect(sim.state.events.filter((e) => e.type === 'ai-error')).toHaveLength(5);
  });
});

describe('consults', () => {
  it('lets an agent ask another a question without handing the request over', () => {
    const sim = new Simulation();
    const t = sim.createTask('lockout');
    run(sim, () => sim.state.agents.bolt.activity === 'consulting');
    // Bolt still owns the request while walking over to Iris.
    expect(t.ownerId).toBe('bolt');
    expect(t.status).toBe('active');
    const progress = t.progress;
    run(sim, () => sim.state.agents.bolt.consult?.phase === 'talking');
    // Question first, answer second, never both bubbles at once.
    expect(sim.state.agents.bolt.say).toBe(sim.state.agents.bolt.consult!.question);
    expect(sim.state.agents.iris.reply).toBeUndefined();
    run(sim, () => !!sim.state.agents.iris.reply);
    expect(sim.state.agents.bolt.say).toBeUndefined();
    expect(t.progress).toBe(progress); // the work waits while Bolt is away
    run(sim, () => sim.state.agents.bolt.activity === 'working');
    expect(sim.state.agents.iris.reply).toBeUndefined();
    expect(t.consults).toHaveLength(1);
    expect(t.consults![0]).toMatchObject({ from: 'bolt', to: 'iris', stage: 'execution' });
    run(sim, () => t.status === 'done');
    // Asked once, and the handoff record is unchanged.
    expect(t.consults).toHaveLength(1);
    expect(t.history.map((h) => h.from)).toEqual(['iris', 'atlas', 'bolt', 'sage', 'echo']);
  });

  it('keeps the colleague at their desk until the exchange ends, even with work to hand off', () => {
    const sim = new Simulation();
    sim.createTask('lockout');
    sim.createTask('lockout'); // keeps Iris busy while Bolt comes to ask
    let left = false;
    run(sim, () => {
      const talking = sim.state.agents.bolt.consult?.phase === 'talking';
      if (talking && sim.state.agents.iris.activity !== 'idle' && sim.state.agents.iris.activity !== 'working') left = true;
      return sim.state.tasks.every((t) => t.status === 'done');
    });
    expect(left).toBe(false);
    expect(sim.state.tasks.every((t) => t.consults?.length === 1)).toBe(true);
  });

  it('does not ask again on a rework pass', () => {
    const sim = new Simulation();
    const t = sim.createTask('phishing');
    run(sim, () => t.status === 'done');
    expect(t.rework).toBe(1);
    expect(t.consults).toHaveLength(1);
  });

  it('stops the consult and goes home when the supervisor puts the request on hold', () => {
    const sim = new Simulation();
    const t = sim.createTask('lockout');
    run(sim, () => sim.state.agents.bolt.consult?.phase === 'talking');
    sim.setHeld(t.id, true);
    run(sim, () => sim.state.agents.bolt.activity === 'idle');
    expect(sim.state.agents.iris.reply).toBeUndefined();
    expect(t.consults ?? []).toHaveLength(0);
    sim.setHeld(t.id, false);
    run(sim, () => t.status === 'done');
    expect(t.consults).toHaveLength(1); // asked once it resumed
  });

  it('waits for the other agent to be back at their desk before asking', () => {
    const sim = new Simulation();
    const t = sim.createTask('vpn'); // Atlas asks Sage during planning
    run(sim, () => t.stage === 'planning' && t.status === 'active');
    // send Sage away on a walk
    sim.state.agents.sage.activity = 'returning';
    sim.state.agents.sage.path = [[0, 0], [...sim.state.agents.sage.pos]];
    run(sim, () => sim.state.agents.atlas.say?.startsWith('Waiting to ask') ?? false);
    run(sim, () => (t.consults?.length ?? 0) === 1);
    expect(t.consults![0]).toMatchObject({ from: 'atlas', to: 'sage', stage: 'planning' });
  });
});

describe('busy office', () => {
  it('clears eight mixed requests with agents crossing paths and no deadlock', () => {
    const sim = new Simulation();
    for (const id of BUSY_MORNING) sim.createTask(id);
    for (let i = 0; i < 20000 && sim.state.tasks.some((t) => t.status !== 'done'); i++) {
      for (const t of sim.state.tasks) if (t.status === 'awaiting-approval') sim.approve(t.id);
      sim.step(0.1);
    }
    expect(sim.state.tasks.every((t) => t.status === 'done')).toBe(true);
    for (let i = 0; i < 100; i++) sim.step(0.1); // let the last carrier walk home
    // every agent ended up back at its own desk
    for (const a of Object.values(sim.state.agents)) expect(a.activity).toBe('idle');
  });

  it('records a complete stage timeline for every request', () => {
    const sim = new Simulation();
    const t = sim.createTask('lockout');
    run(sim, () => t.status === 'done');
    expect(t.timeline.map((s) => s.stage)).toEqual(['triage', 'planning', 'execution', 'review', 'delivery', 'done']);
    for (const s of t.timeline) {
      expect(s.started! >= s.arrived).toBe(true);
      expect(s.finished! >= s.started!).toBe(true);
    }
  });
});
