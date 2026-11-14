import { describe, expect, it } from 'vitest';
import { allRequestsCsv, taskAudit, toCsv } from './audit';
import { Simulation } from './engine';
import { DEFAULT_VALUE, computeMetrics, slaInsight, valueEstimate } from './metrics';
import { slaInfo } from './sla';

function runFor(sim: Simulation, seconds: number, approve = true) {
  for (let i = 0; i < seconds * 10; i++) {
    if (approve) for (const t of sim.state.tasks) if (t.status === 'awaiting-approval') sim.approve(t.id);
    sim.step(0.1);
  }
}

describe('response-time targets', () => {
  it('moves from on track to at risk to breached, and logs the breach once', () => {
    const sim = new Simulation();
    const t = sim.createTask('vpn'); // urgent: 60s target, stops for approval
    expect(slaInfo(t, sim.state.time)!.state).toBe('on-track');
    runFor(sim, 50, false);
    expect(slaInfo(t, sim.state.time)!.state).toBe('at-risk');
    runFor(sim, 30, false);
    expect(slaInfo(t, sim.state.time)!.state).toBe('breached');
    runFor(sim, 30, false);
    expect(sim.state.events.filter((e) => e.type === 'sla-breach')).toHaveLength(1);
  });

  it('records met or missed when the request closes', () => {
    const sim = new Simulation();
    const fast = sim.createTask('lockout');
    runFor(sim, 120);
    expect(slaInfo(fast, sim.state.time)!.state).toBe('met');
    const slow = sim.createTask('vpn');
    runFor(sim, 90, false); // sits at approval past its 60s target
    sim.approve(slow.id);
    runFor(sim, 40);
    expect(slaInfo(slow, sim.state.time)!.state).toBe('missed');
    expect(computeMetrics(sim.state).slaMet).toBeCloseTo(0.5);
  });

  it('takes the earliest deadline first, so old low-priority work is not starved', () => {
    const sim = new Simulation();
    const blocker = sim.createTask('lockout');
    const oldLow = sim.createTask('lockout'); // P3, due at 480
    runFor(sim, 0.2);
    sim.state.time = 300; // much later, a normal request arrives (due at 540)
    const newNormal = sim.createTask('custom', 'New normal request');
    expect(sim.queueFor('iris')[0].id).toBe(oldLow.id);
    expect(blocker.status).not.toBe('queued');
    expect(newNormal.status).toBe('queued');
  });

  it('puts a request about to miss its target at the top of the recommendations', () => {
    const sim = new Simulation();
    const t = sim.createTask('vpn');
    runFor(sim, 52, false);
    const m = computeMetrics(sim.state);
    expect(m.slaAlerts[0].task.id).toBe(t.id);
    expect(m.insight).toMatch(new RegExp(`^${t.id} \\(urgent\\) is due in \\d+s and is waiting for your approval\\. Decide on it now\\.`));
    expect(slaInsight([])).toBeUndefined();
  });
});

describe('business value estimate', () => {
  it('is empty until something is completed', () => {
    expect(valueEstimate(new Simulation().state, DEFAULT_VALUE)).toBeNull();
  });

  it('counts human time only where a person stepped in', () => {
    const sim = new Simulation();
    sim.createTask('lockout'); // no human action
    sim.createTask('onboarding'); // one approval
    runFor(sim, 300);
    const v = valueEstimate(sim.state, DEFAULT_VALUE)!;
    expect(v.completed).toBe(2);
    expect(v.touches).toBe(1);
    expect(v.humanMinutesPerRequest).toBeCloseTo(2); // 4 minutes over 2 requests
    expect(v.savedMinutesPerRequest).toBeCloseTo(23);
    expect(v.savedHoursRun).toBeCloseTo((2 * 23) / 60);
    expect(v.monthlyHours).toBeCloseTo((40 * 21 * 23) / 60);
    expect(v.monthlyCost).toBeCloseTo(v.monthlyHours * 45);
  });

  it('never reports negative savings', () => {
    const sim = new Simulation();
    sim.createTask('onboarding');
    runFor(sim, 200);
    expect(valueEstimate(sim.state, { ...DEFAULT_VALUE, manualMinutes: 1 })!.savedMinutesPerRequest).toBe(0);
  });
});

describe('audit export', () => {
  it('includes the full trail of a request', () => {
    const sim = new Simulation();
    const t = sim.createTask('onboarding');
    runFor(sim, 200);
    const a = taskAudit(sim.state, t, '2026-11-13T12:00:00Z');
    expect(a.request).toMatchObject({ id: t.id, mode: 'scripted', status: 'done', response_target: '4 hours', response_target_result: 'met' });
    expect(a.stages.map((x) => x.stage)).toEqual(['Request', 'Plan', 'Execute', 'Review', 'Approve', 'Complete', 'Done']);
    expect(a.handoffs.some((h) => h.kind === 'approval' && h.from === 'Supervisor')).toBe(true);
    expect(a.outputs).toHaveLength(6);
    expect(a.events.length).toBeGreaterThan(10);
  });

  it('quotes CSV safely, including commas, quotes, new lines and formula-like text', () => {
    expect(toCsv([['a,b', 'say "hi"', 'line\nbreak', '=SUM(A1)', 3, null]])).toBe('"a,b","say ""hi""","line\nbreak","\'=SUM(A1)","3",""\r\n');
  });

  it('exports one row per request', () => {
    const sim = new Simulation();
    sim.createTask('lockout');
    sim.createTask('custom', '=HYPERLINK("http://bad")');
    const rows = allRequestsCsv(sim.state).trim().split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toContain(`"'=HYPERLINK(""http://bad"")"`);
  });
});

describe('response targets with a live model', () => {
  it('does not count time spent waiting for the model against the target', () => {
    // A model that takes a long time to answer each stage.
    let pending: { id: string; key: string; due: number }[] = [];
    let tick = 0;
    const sim = new Simulation(null, {
      requestAI: (t, _stage, key) => {
        if (!pending.some((p) => p.id === t.id && p.key === key)) pending.push({ id: t.id, key, due: tick + 400 }); // 40 simulated seconds each
      },
    });
    const t = sim.createTask('custom', 'Slow model, urgent request', 'ai');
    t.priority = 'P1'; // 60s target
    for (let i = 0; i < 20000 && t.status !== 'done'; i++) {
      tick++;
      for (const p of pending.filter((x) => x.due <= tick)) sim.provideAI(p.id, p.key, { status: 'done', steps: ['Working'], body: 'ok', verdict: 'pass' });
      pending = pending.filter((x) => x.due > tick);
      sim.step(0.1);
    }
    expect(t.status).toBe('done');
    expect(t.aiWait!).toBeGreaterThan(150); // most of the time was the model
    expect(slaInfo(t, sim.state.time)!.state).toBe('met');
    expect(sim.state.events.some((e) => e.type === 'sla-breach')).toBe(false);
  });
});
