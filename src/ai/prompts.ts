// Builds the model request for one agent doing one stage. Pure, so it is unit-tested
// and would move unchanged to a server-side worker.
//
// Design:
// - One call per stage, so each agent only sees its own role, its own instructions,
//   and the work handed to it. That mirrors least-privilege tool access in production.
// - Output is forced through a tool schema ("structured output"), so the orchestrator
//   gets typed fields (priority, risky, verdict) instead of parsing free text.
// - The model is told it is in a simulation and has no system access, so it describes
//   actions rather than claiming to have performed them.

import { AGENTS, STAGE_OWNER, actorName } from '../sim/data';
import type { Task, WorkStage } from '../sim/types';

export interface StageRequest {
  system: string;
  user: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
}

const STEPS = {
  type: 'array',
  items: { type: 'string' },
  minItems: 2,
  maxItems: 4,
  description: 'Two to four short progress lines shown in a speech bubble while you work, each under 8 words, starting with a verb ending in -ing. Example: "Checking sign-in logs".',
};

const INSTRUCTIONS: Record<WorkStage, string> = {
  triage:
    'Classify the request and set a priority. P1 only for a security incident in progress, or when many people cannot do their core work and have no workaround (for example email or VPN down for a whole office). ' +
    'P2 for normal work, including outages with a workaround, such as one printer down when others are available. P3 if one person is affected and can carry on. ' +
    'In body, write 3 to 5 short lines in the form "Label: value" covering type, priority with a reason, who is affected, and an "Assumed:" line for any detail the requester left out (pick something sensible).',
  planning:
    'Write a numbered plan of 3 to 6 concrete steps in body, one per line. ' +
    'Set risky to true if any step changes production infrastructure, grants admin or elevated access, deletes data, or affects many users at once, and give a one-line risk_reason. Otherwise set risky to false.',
  execution:
    'Carry out the plan. In body, write a change log: one line per action and its result. ' +
    'If the plan marked a step as risky, stage it ("staged, not applied") instead of applying it.',
  review:
    'Check the change log against the plan and normal IT security policy. Set verdict to "pass" if the work is complete and safe, ' +
    '"changes" if something specific is missing or wrong (say exactly what to fix), or "escalate" if a person must decide. ' +
    'In body, write 2 to 5 lines of findings.',
  delivery:
    'Write the reply to the requester in body: 2 to 4 friendly, plain-language sentences saying what was done, based on the change log, and anything they need to do. ' +
    'Then a blank line, then one line saying how the ticket was closed. If the supervisor approved something, mention that. ' +
    'Stay consistent with the work above: if it was done, say it is resolved; if something is genuinely still outstanding, say what and that a follow-up ticket was opened. Never call the ticket unresolved after the work and review are complete.',
};

const EXTRA_FIELDS: Partial<Record<WorkStage, { props: Record<string, unknown>; required: string[] }>> = {
  triage: { props: { priority: { type: 'string', enum: ['P1', 'P2', 'P3'] } }, required: ['priority'] },
  planning: { props: { risky: { type: 'boolean' }, risk_reason: { type: 'string', description: 'One line. Empty if not risky.' } }, required: ['risky'] },
  review: { props: { verdict: { type: 'string', enum: ['pass', 'changes', 'escalate'] } }, required: ['verdict'] },
};

export function buildStageRequest(task: Task, stage: WorkStage): StageRequest {
  const me = AGENTS[STAGE_OWNER[stage]];
  const system = [
    `You are ${me.name}, the ${me.role.toLowerCase()} agent at Atrium, an IT service desk staffed by five AI agents and one human supervisor.`,
    'The pipeline is: Iris triages, Atlas plans, Bolt executes, Sage reviews, the human supervisor approves anything risky, and Echo replies to the requester and closes the ticket.',
    `Your job: ${me.blurb}`,
    `Your limits: ${me.limits}`,
    'This is a demonstration. You have no access to real systems. Describe the actions you would take and their expected results as a realistic, clearly simulated record.',
    'When a detail is missing (a device name, a count, an error message), do not stop to ask for it: assume something sensible, say so in one short line, and carry on. Use earlier agents\' assumptions where they exist. Never include real personal data.',
    'Unless the request is genuinely unsafe or impossible, the simulated work succeeds, so the story ends with the problem solved.',
    'Use only the names given in the request. Do not invent surnames, people, approvals or sign-offs that are not recorded in the work so far.',
    'Write plainly in short lines. No markdown, no headings, no bold. Always answer by calling the submit tool.',
  ].join('\n');

  const history = task.outputs
    .map((o) => `--- ${o.title} (${o.by === 'human' ? 'Supervisor' : actorName(o.by)}) ---\n${o.body}`)
    .join('\n\n');

  const notes: string[] = [];
  const approved = task.outputs.some((o) => o.by === 'human' && o.kind === 'ok' && o.stage === 'approval');
  if (stage === 'delivery' && approved) {
    notes.push('The supervisor approved this work. As part of closing, you applied the changes that were staged for approval, so they are now live (with any time limit or expiry from the plan). Say that in the reply.');
  }
  if (stage === 'execution' && task.rework > 0) {
    const feedback = [...task.outputs].reverse().find((o) => o.kind === 'changes');
    notes.push(`This is a revision. Fix exactly what was asked:\n${feedback?.body ?? task.humanNote ?? 'See the feedback above.'}`);
  }
  if (stage === 'review' && task.rework > 0) {
    notes.push('This is the second review. If it is still not right, choose "escalate" so a person decides, rather than "changes".');
  }

  const user = [
    `Request ${task.id} from ${task.requester}: "${task.title}"`,
    `Current priority: ${task.priority}`,
    history ? `\nWork so far:\n${history}` : '\nNo work has been done yet. You are first.',
    ...notes.map((n) => `\n${n}`),
    `\nDo your step now. ${INSTRUCTIONS[stage]}`,
  ].join('\n');

  const extra = EXTRA_FIELDS[stage];
  return {
    system,
    user,
    tool: {
      name: `submit_${stage}`,
      description: `Submit your ${stage} result.`,
      input_schema: {
        type: 'object',
        properties: { steps: STEPS, body: { type: 'string' }, ...(extra?.props ?? {}) },
        required: ['steps', 'body', ...(extra?.required ?? [])],
      },
    },
  };
}
