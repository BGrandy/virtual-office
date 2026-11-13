import { describe, expect, it } from 'vitest';
import { Simulation } from './engine';
import type { Task } from './types';

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
