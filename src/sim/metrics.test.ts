import { describe, expect, it } from 'vitest';
import { Simulation } from './engine';
import { computeMetrics, insightFor, type StageStat } from './metrics';

function runFor(sim: Simulation, seconds: number, approve = true) {
  for (let i = 0; i < seconds * 10; i++) {
    if (approve) for (const t of sim.state.tasks) if (t.status === 'awaiting-approval') sim.approve(t.id);
    sim.step(0.1);
  }
}

describe('dashboard metrics', () => {
  it('starts empty with a prompt to act', () => {
    const m = computeMetrics(new Simulation().state);
    expect(m.completed).toBe(0);
    expect(m.insight).toMatch(/Complete a request/);
  });

  it('counts autonomy only for requests nobody had to touch', () => {
    const sim = new Simulation();
    sim.createTask('lockout'); // no approval needed
    sim.createTask('onboarding'); // approved by a person
    runFor(sim, 300);
    const m = computeMetrics(sim.state);
    expect(m.completed).toBe(2);
    expect(m.autonomy).toBeCloseTo(0.5);
    expect(m.human.approvals).toBe(1);
  });

  it('splits stage time into waiting and working', () => {
    const sim = new Simulation();
    for (let i = 0; i < 3; i++) sim.createTask('lockout');
    runFor(sim, 400);
    const exec = computeMetrics(sim.state).stages.find((s) => s.stage === 'execution')!;
    expect(exec.samples).toBe(3);
    expect(exec.work).toBeGreaterThan(10); // 11s scripted execution
    expect(exec.wait).toBeGreaterThan(0); // the 2nd and 3rd waited in Bolt's tray
  });

  it('points at a pile-up while it is happening', () => {
    const sim = new Simulation();
    for (let i = 0; i < 5; i++) sim.createTask('lockout');
    sim.step(0.1);
    expect(computeMetrics(sim.state).insight).toMatch(/waiting for Iris/);
  });

  it('flags slow approvals as the main delay', () => {
    const sim = new Simulation();
    const t = sim.createTask('onboarding');
    runFor(sim, 60, false);
    expect(t.status).toBe('awaiting-approval');
    runFor(sim, 200, false); // leave it sitting
    sim.approve(t.id);
    runFor(sim, 60);
    expect(computeMetrics(sim.state).insight).toMatch(/approval/);
  });
});

describe('recommendation wording', () => {
  const stat = (stage: StageStat['stage'], label: string, owner: string, wait: number, work: number): StageStat => ({ stage, label, owner, wait, work, samples: 3 });
  it('names the desk and the role when a tray wait dominates', () => {
    const text = insightFor([stat('triage', 'Request', 'Iris', 30, 5), stat('execution', 'Execute', 'Bolt', 2, 11)], [], 3, 0);
    expect(text).toBe("Requests spend the most time (63%) waiting for Iris to start triage. That desk is the bottleneck: reassign some of its work, or add another intake and triage agent.");
  });
  it('names the longest step when work dominates', () => {
    expect(insightFor([stat('execution', 'Execute', 'Bolt', 1, 11)], [], 3, 0)).toMatch(/^Doing the work takes the longest \(92%/);
  });
});
