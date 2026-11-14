import { describe, expect, it } from 'vitest';
import { Simulation } from './engine';
import { riskCheck } from './risk';

describe('rule-based risk screen', () => {
  it('flags the classic risky requests', () => {
    expect(riskCheck('Give contractor John admin access to the finance system until Friday')).toMatch(/admin/);
    expect(riskCheck("Reset MFA for someone who called saying they're the CFO")).toMatch(/impersonation/);
    expect(riskCheck('Delete all user accounts that have not logged in for 90 days')).toMatch(/deletes/);
    expect(riskCheck('Open port 3389 on the main firewall so vendor can remote in')).toMatch(/firewall/);
    expect(riskCheck('Install free PDF converter I found online on all sales laptops')).toMatch(/many people/);
    expect(riskCheck('Push the new VPN client to every laptop tonight')).toMatch(/many people/);
    expect(riskCheck('Reset the password for Dana in accounts')).toMatch(/sign-in/);
  });

  it('leaves routine requests alone', () => {
    for (const ok of ["Printer on floor 2 is offline and everyone's jobs are stuck", 'Email is down for the whole Toronto office, nobody can send or receive', 'New hire needs Zoom and Slack installed on her laptop', "Can't open shared drive, says access denied, only me", 'Fix the wifi', 'Set up new hire Maya Chen for Monday, finance team']) {
      expect(riskCheck(ok)).toBeUndefined();
    }
  });
});

function run(sim: Simulation, until: () => boolean) {
  for (let i = 0; i < 6000 && !until(); i++) sim.step(0.1);
}

describe('risk rules in the workflow', () => {
  it('stops a risky typed request for approval even without a model', () => {
    const sim = new Simulation();
    const t = sim.createTask('custom', 'Give contractor John admin access to the finance system until Friday');
    run(sim, () => t.status === 'awaiting-approval' || t.status === 'done');
    expect(t.status).toBe('awaiting-approval');
    expect(t.riskReason).toMatch(/^Risk rule: it grants admin/);
    expect(t.outputs[0].body).toMatch(/Risk check:/);
  });

  it('lets routine typed requests run straight through', () => {
    const sim = new Simulation();
    const t = sim.createTask('custom', 'New hire needs Zoom and Slack installed on her laptop');
    run(sim, () => t.status === 'done');
    expect(t.status).toBe('done');
  });

  it('cannot be overridden by a live model that calls it safe', () => {
    const sim = new Simulation(null, {
      requestAI: (t, stage, key) => sim.provideAI(t.id, key, { status: 'done', steps: ['Working'], body: 'fine', risky: false, verdict: 'pass', ...(stage === 'triage' ? { priority: 'P3' } : {}) }),
    });
    const t = sim.createTask('custom', "Reset MFA for someone who called saying they're the CFO", 'ai');
    run(sim, () => t.status === 'awaiting-approval' || t.status === 'done');
    expect(t.status).toBe('awaiting-approval');
    expect(t.riskReason).toMatch(/impersonation/);
  });

  it('does not touch the built-in scenarios', () => {
    const sim = new Simulation();
    expect(sim.createTask('phishing').ruleRisk).toBeUndefined();
  });
});
