import { describe, expect, it } from 'vitest';
import { Simulation } from '../sim/engine';
import { clip, parseStage } from './anthropic';
import { buildStageRequest } from './prompts';

const tool = (input: Record<string, unknown>) => ({ content: [{ type: 'tool_use', input }] });

describe('prompt building', () => {
  it('gives each agent only its own role and the work handed to it', () => {
    const sim = new Simulation();
    const t = sim.createTask('custom', 'Printer on floor 2 is offline', 'ai');
    const r = buildStageRequest(t, 'triage');
    expect(r.system).toMatch(/You are Iris/);
    expect(r.system).toMatch(/no access to real systems/);
    expect(r.user).toMatch(/Printer on floor 2 is offline/);
    expect(r.tool.name).toBe('submit_triage');
    expect((r.tool.input_schema as { required: string[] }).required).toContain('priority');
  });

  it('passes earlier outputs and reviewer feedback into a revision', () => {
    const sim = new Simulation();
    const t = sim.createTask('custom', 'Shared mailbox', 'ai');
    t.outputs.push({ stage: 'review', by: 'sage', title: 'Changes requested', body: 'Add the finance group', t: 1, kind: 'changes' });
    t.rework = 1;
    const r = buildStageRequest(t, 'execution');
    expect(r.system).toMatch(/You are Bolt/);
    expect(r.user).toMatch(/This is a revision/);
    expect(r.user).toMatch(/Add the finance group/);
  });
});

describe('response parsing', () => {
  it('reads a well-formed tool call', () => {
    const r = parseStage(tool({ steps: ['Checking logs.', 'Unlocking'], body: 'Unlocked', priority: 'P1' }), 'triage', 'claude-haiku-5-5');
    expect(r).toMatchObject({ status: 'done', steps: ['Checking logs', 'Unlocking'], body: 'Unlocked', priority: 'P1', model: 'Claude Haiku 5.5' });
  });

  it('ignores fields the stage is not allowed to set and unknown values', () => {
    const r = parseStage(tool({ steps: [], body: 'ok', verdict: 'approve-myself', priority: 'P0', risky: true }), 'review', 'x');
    expect(r.verdict).toBe('pass');
    expect(r.priority).toBeUndefined();
    expect(r.risky).toBeUndefined();
    expect(r.steps).toEqual(['Working on it']);
  });

  it('accepts JSON in plain text as a fallback', () => {
    const r = parseStage({ content: [{ type: 'text', text: 'Here: {"steps":["Doing"],"body":"Done","risky":true,"risk_reason":"Admin access"}' }] }, 'planning', 'x');
    expect(r.risky).toBe(true);
    expect(r.riskReason).toBe('Admin access');
  });

  it('rejects an answer with no body so the engine falls back to the script', () => {
    expect(() => parseStage(tool({ steps: ['x'] }), 'triage', 'x')).toThrow(/wrong shape/);
    expect(() => parseStage({ content: [] }, 'triage', 'x')).toThrow();
  });
});

describe('prompt guidance', () => {
  it('tells agents to assume missing details and keep the story consistent', () => {
    const sim = new Simulation();
    const t = sim.createTask('custom', 'Printer on floor 2 is offline', 'ai');
    const triage = buildStageRequest(t, 'triage');
    expect(triage.system).toMatch(/do not stop to ask/);
    expect(triage.system).toMatch(/Never record one as pending/);
    expect(triage.user).toMatch(/one printer down when others are available/);
    expect(buildStageRequest(t, 'delivery').user).toMatch(/Never call the ticket unresolved/);
  });
});

describe('closing approved work', () => {
  it('tells Echo that approved staged changes are applied when closing', () => {
    const sim = new Simulation();
    const t = sim.createTask('custom', 'Give contractor John admin access to the finance system', 'ai');
    expect(buildStageRequest(t, 'delivery').user).not.toMatch(/supervisor approved this work/);
    t.outputs.push({ stage: 'approval', by: 'human', title: 'Approved by supervisor', body: 'ok', t: 1, kind: 'ok', source: 'human' });
    let r = buildStageRequest(t, 'delivery');
    expect(r.user).toMatch(/Nothing was staged, so do not mention staging/);
    expect(r.system).toMatch(/Do not invent surnames/);
    t.outputs.splice(0, 0, { stage: 'execution', by: 'bolt', title: 'Change log', body: 'Finance admin role for John: staged, not applied', t: 0, kind: 'ok', source: 'ai' });
    r = buildStageRequest(t, 'delivery');
    expect(r.user).toMatch(/you applied the changes that were staged/);
  });
});

describe('keeping work moving', () => {
  it('tells the planner, technician and reviewer not to stall on missing information', () => {
    const sim = new Simulation();
    const t = sim.createTask('custom', 'Set up new hire Maya Chen for Monday', 'ai');
    expect(buildStageRequest(t, 'planning').user).toMatch(/Every step must be doable now/);
    expect(buildStageRequest(t, 'execution').user).toMatch(/Carry out every step of the plan in this one pass/);
    const review = buildStageRequest(t, 'review').user;
    expect(review).toMatch(/only needs information from the requester is not a reason to fail or escalate/);
  });

  it('trims long outputs at a line break, never mid-word', () => {
    const long = Array.from({ length: 80 }, (_, i) => `Line ${i}: the account was updated successfully.`).join('\n');
    const out = clip(long, 500);
    expect(out.length).toBeLessThanOrEqual(502);
    expect(out.endsWith('successfully. …') || out.endsWith('successfully.\n …') || /successfully\. …$/.test(out)).toBe(true);
    expect(clip('short', 500)).toBe('short');
  });
});
