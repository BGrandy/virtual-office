// MOCK DATA. Every agent profile, step and output in this file is scripted.
// No language model is called anywhere in this demo.
// In production each `StageScript` would be replaced by a real model call with tool use.

import type { AgentId, AIStageResult, Priority, Stage, Task, WorkStage } from './types';

export interface AgentProfile {
  id: AgentId;
  name: string;
  role: string;
  stage: WorkStage;
  color: string;
  blurb: string;
  skills: string[];
  /** Systems this agent would be allowed to touch in production. */
  tools: string[];
  /** Guardrail a supervisor should know about. */
  limits: string;
}

export const AGENTS: Record<AgentId, AgentProfile> = {
  iris: {
    id: 'iris', name: 'Iris', role: 'Intake and triage', stage: 'triage', color: '#2A78D6',
    blurb: 'Reads every incoming request, works out what is being asked, how urgent it is, and who is affected.',
    skills: ['Classify requests', 'Set priority and SLA', 'Spot duplicates', 'Ask for missing details'],
    tools: ['Ticketing system (read, tag)', 'Staff directory (read)'],
    limits: 'Cannot change any system. Only labels and routes work.',
  },
  atlas: {
    id: 'atlas', name: 'Atlas', role: 'Planner', stage: 'planning', color: '#EB6834',
    blurb: 'Turns a triaged request into a short, checkable plan and flags any step that needs human sign-off.',
    skills: ['Break work into steps', 'Match runbooks', 'Flag risky changes', 'Estimate effort'],
    tools: ['Runbook library (read)', 'Asset inventory (read)'],
    limits: 'Plans only. Does not execute.',
  },
  bolt: {
    id: 'bolt', name: 'Bolt', role: 'Technician', stage: 'execution', color: '#1BAF7A',
    blurb: 'Carries out the plan: creates accounts, runs diagnostics, applies fixes, and records exactly what changed.',
    skills: ['Provision accounts', 'Run diagnostics', 'Apply fixes', 'Keep a change log'],
    tools: ['Identity provider (write)', 'Device management (write)', 'Network monitoring (read)', 'Mail security (write)'],
    limits: 'Changes marked risky are staged, not applied, until a person approves.',
  },
  sage: {
    id: 'sage', name: 'Sage', role: 'Quality reviewer', stage: 'review', color: '#6250D6',
    blurb: 'Checks the work against the plan and policy. Sends it back if something is missing, or escalates to a person.',
    skills: ['Verify against checklist', 'Policy and security checks', 'Request rework', 'Escalate for approval'],
    tools: ['Audit logs (read)', 'Policy library (read)'],
    limits: 'Independent of the technician. Cannot edit the work it reviews.',
  },
  echo: {
    id: 'echo', name: 'Echo', role: 'Comms and records', stage: 'delivery', color: '#E87BA4',
    blurb: 'Writes the reply to the requester in plain language, updates the knowledge base, and closes the ticket.',
    skills: ['Write user replies', 'Update knowledge base', 'Close tickets', 'Summarise for managers'],
    tools: ['Email and chat (send)', 'Knowledge base (write)', 'Ticketing system (close)'],
    limits: 'Only sends after review has passed.',
  },
};

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];
export const HUMAN = { name: 'You', role: 'Supervisor', color: '#14233B' };
export const actorName = (a: string) => (a === 'human' ? 'Supervisor' : a === 'archive' ? 'Archive' : AGENTS[a as AgentId]?.name ?? a);

export const STAGE_OWNER: Record<WorkStage, AgentId> = {
  triage: 'iris', planning: 'atlas', execution: 'bolt', review: 'sage', delivery: 'echo',
};

/**
 * Response-time targets (SLAs) per priority, in simulated seconds.
 * The demo runs roughly 60 times faster than a real desk, so one simulated second
 * stands for about one real minute: 60s here is a 1-hour target.
 */
export const SLA_TARGET: Record<Priority, number> = { P1: 60, P2: 240, P3: 480 };
export const SLA_REAL: Record<Priority, string> = { P1: '1 hour', P2: '4 hours', P3: '8 hours' };
export const PRIORITY_NAME: Record<Priority, string> = { P1: 'Urgent', P2: 'Normal', P3: 'Low' };

/** Seconds of simulated work per stage at 1x speed. */
export const STAGE_DURATION: Record<WorkStage, number> = {
  triage: 5, planning: 6.5, execution: 11, review: 6.5, delivery: 5.5,
};

export const STAGE_META: Record<Stage, { label: string; verb: string }> = {
  triage: { label: 'Request', verb: 'Triaging the request' },
  planning: { label: 'Plan', verb: 'Planning the work' },
  execution: { label: 'Execute', verb: 'Doing the work' },
  review: { label: 'Review', verb: 'Reviewing the work' },
  approval: { label: 'Approve', verb: 'Waiting for your approval' },
  delivery: { label: 'Complete', verb: 'Replying and closing out' },
  done: { label: 'Done', verb: 'Completed' },
};
export const PIPELINE: Stage[] = ['triage', 'planning', 'execution', 'review', 'approval', 'delivery'];


export interface StageScript {
  steps: string[];
  output: { title: string; body: string };
}

export interface TaskTemplate {
  id: string;
  title: string;
  summary: string;
  requester: string;
  priority: Priority;
  /** Risky work always stops for human approval. */
  risky: boolean;
  riskReason?: string;
  stages: Record<WorkStage, StageScript>;
  /** Optional scripted review failure, to show the rework loop. */
  rework?: { review: StageScript; fix: StageScript };
}

export const TEMPLATES: TaskTemplate[] = [
  {
    id: 'onboarding',
    title: 'Set up new hire Maya Chen for Monday',
    summary: 'Accounts, laptop and licences for a new starter. Includes an admin licence, so it stops for your approval.',
    requester: 'Priya (HR)',
    priority: 'P2',
    risky: true,
    riskReason: 'Grants an admin-level finance licence',
    stages: {
      triage: {
        steps: ['Reading the HR request', 'Matching to the onboarding category', 'Setting priority from the start date'],
        output: { title: 'Triage summary', body: 'Type: New starter onboarding\nPriority: P2, due before Monday 9:00\nAffected: 1 person (Maya Chen, Finance)\nMissing info: none' },
      },
      planning: {
        steps: ['Pulling the Finance onboarding runbook', 'Listing accounts and hardware needed', 'Flagging the admin licence for approval'],
        output: { title: 'Work plan', body: '1. Create directory account and mailbox\n2. Add to Finance groups and shared drives\n3. Enrol laptop FIN-LT-0231 and push standard apps\n4. Assign finance system licence (admin tier, needs approval)\n5. Schedule first-day welcome email' },
      },
      execution: {
        steps: ['Creating account maya.chen', 'Adding Finance groups and drives', 'Enrolling laptop and pushing apps', 'Staging the admin licence for approval'],
        output: { title: 'Change log', body: 'Created maya.chen with temporary password and MFA enrolment required\nAdded to 4 groups, 2 shared drives\nLaptop FIN-LT-0231 enrolled, 12 apps installed, disk encrypted\nFinance admin licence staged, not yet applied' },
      },
      review: {
        steps: ['Checking each plan step against the change log', 'Confirming MFA and disk encryption', 'Escalating the admin licence to a person'],
        output: { title: 'Review result', body: 'Passed: 4 of 4 completed steps match the plan\nSecurity: MFA enforced, disk encrypted\nNeeds a person: admin-tier licence is outside what agents may grant alone' },
      },
      delivery: {
        steps: ['Applying the approved licence', 'Writing the welcome email', 'Closing the ticket'],
        output: { title: 'Reply sent to Priya (HR)', body: 'Maya is ready for Monday. Her laptop is at the IT desk for collection, and her welcome email with sign-in steps is scheduled for 8:30. The finance licence was approved by the IT supervisor.\n\nTicket closed. Onboarding checklist saved to her staff record.' },
      },
    },
  },
  {
    id: 'vpn',
    title: 'Sales team cannot connect to the VPN',
    summary: 'A live outage affecting 14 people. Urgent, and the fix changes a firewall rule, so it stops for your approval.',
    requester: 'Marcus (Sales lead)',
    priority: 'P1',
    risky: true,
    riskReason: 'Changes a production firewall rule',
    stages: {
      triage: {
        steps: ['Reading the report', 'Checking for similar reports in the last hour', 'Raising to P1, multiple people blocked'],
        output: { title: 'Triage summary', body: 'Type: Incident, remote access\nPriority: P1, 14 people blocked, 6 similar reports merged\nStarted: about 25 minutes ago\nScope: Sales only, other teams unaffected' },
      },
      planning: {
        steps: ['Comparing with recent changes', 'Picking the VPN outage runbook', 'Flagging the firewall change for approval'],
        output: { title: 'Work plan', body: '1. Check VPN gateway health and certificate\n2. Compare Sales group policy with a working team\n3. Review firewall changes from the last 24 hours\n4. Prepare the fix and a rollback (needs approval)\n5. Confirm with two affected users' },
      },
      execution: {
        steps: ['Checking gateway and certificate', 'Comparing group policies', 'Found it: last night\'s rule blocks the Sales subnet', 'Preparing fix and rollback'],
        output: { title: 'Diagnosis and staged fix', body: 'Gateway healthy, certificate valid until March\nCause: firewall rule FW-2291, added last night, blocks subnet 10.40.8.0/24 (Sales)\nFix staged: narrow FW-2291 to exclude the Sales subnet\nRollback staged: restore FW-2291 as it is now' },
      },
      review: {
        steps: ['Re-running the diagnosis independently', 'Checking the fix does not reopen anything else', 'Escalating the firewall change to a person'],
        output: { title: 'Review result', body: 'Diagnosis confirmed from firewall logs\nFix is the smallest change that restores access\nRollback tested in staging\nNeeds a person: production firewall change' },
      },
      delivery: {
        steps: ['Applying the approved fix', 'Confirming with two Sales users', 'Posting the all-clear'],
        output: { title: 'All-clear sent to Sales', body: 'VPN access is restored. A firewall change made last night blocked the Sales network by mistake, and it has been corrected. No action needed on your side, just reconnect.\n\nIncident closed after 2 user confirmations. Post-incident note added to the knowledge base.' },
      },
    },
  },
  {
    id: 'phishing',
    title: 'Suspicious "invoice overdue" email reported',
    summary: 'A phishing report. The reviewer catches a gap and sends it back once, so you can see the rework loop.',
    requester: 'Dana (Accounts)',
    priority: 'P2',
    risky: false,
    stages: {
      triage: {
        steps: ['Reading the reported email', 'Checking sender and link reputation', 'Confirming it is phishing'],
        output: { title: 'Triage summary', body: 'Type: Security, phishing\nPriority: P2\nSender: billing@acme-invoices.co (lookalike domain)\nReach: delivered to 23 mailboxes, 2 people clicked' },
      },
      planning: {
        steps: ['Picking the phishing response runbook', 'Listing containment steps', 'Ordering by risk'],
        output: { title: 'Work plan', body: '1. Remove the email from all 23 mailboxes\n2. Block the sender domain\n3. Reset passwords for the 2 people who clicked\n4. Check sign-in logs for those accounts\n5. Warn staff' },
      },
      execution: {
        steps: ['Removing the email from mailboxes', 'Blocking acme-invoices.co', 'Resetting 2 passwords', 'Checking sign-in logs'],
        output: { title: 'Change log', body: 'Removed from 23 of 23 mailboxes\nBlocked domain acme-invoices.co\nPasswords reset for 2 accounts, sessions revoked\nSign-in logs: no unusual activity' },
      },
      review: {
        steps: ['Checking containment is complete', 'Searching for sibling domains', 'Confirming the block covers them'],
        output: { title: 'Review result', body: 'Passed: email removed, both domains blocked, accounts secured\nNo sign of account misuse\nSafe to close' },
      },
      delivery: {
        steps: ['Writing the staff warning', 'Thanking the reporter', 'Closing the ticket'],
        output: { title: 'Reply sent to Dana and all staff', body: 'Thanks for reporting this, Dana. The email was a phishing attempt and has been removed from everyone\'s inbox. If you clicked the link, your password has already been reset.\n\nTicket closed. Both lookalike domains added to the block list.' },
      },
    },
    rework: {
      review: {
        steps: ['Checking containment is complete', 'Searching for sibling domains', 'Found a second lookalike domain still allowed'],
        output: { title: 'Changes requested', body: 'Not ready to close.\nThe same campaign also uses acme-invoice.co (no "s"), which is not blocked.\n3 more emails from it are sitting in quarantine.\nPlease block the second domain and purge those emails.' },
      },
      fix: {
        steps: ['Reading the reviewer\'s note', 'Blocking acme-invoice.co', 'Purging 3 quarantined emails'],
        output: { title: 'Change log, second pass', body: 'Blocked second domain acme-invoice.co\nPurged 3 quarantined emails\nAdded a rule to catch similar lookalikes of acme.com' },
      },
    },
  },
  {
    id: 'lockout',
    title: 'Locked out after too many password attempts',
    summary: 'The everyday case. Low risk, so the agents finish it without stopping for you.',
    requester: 'Tom (Warehouse)',
    priority: 'P3',
    risky: false,
    stages: {
      triage: {
        steps: ['Reading the request', 'Verifying Tom through the staff directory', 'Standard request, low risk'],
        output: { title: 'Triage summary', body: 'Type: Access, account lockout\nPriority: P3\nIdentity: verified against directory and manager on record\nMissing info: none' },
      },
      planning: {
        steps: ['Picking the lockout runbook', 'Checking why the lockout happened'],
        output: { title: 'Work plan', body: '1. Confirm the failed attempts came from Tom\'s usual device\n2. Unlock the account\n3. Issue a one-time sign-in link\n4. Remind about the password manager' },
      },
      execution: {
        steps: ['Checking failed sign-in sources', 'Unlocking the account', 'Sending a one-time sign-in link'],
        output: { title: 'Change log', body: 'Failed attempts: 6, all from Tom\'s registered handheld\nAccount unlocked\nOne-time link sent to his verified phone, expires in 15 minutes' },
      },
      review: {
        steps: ['Checking identity was verified first', 'Confirming no risky sign-ins'],
        output: { title: 'Review result', body: 'Passed: identity verified before unlock\nNo sign-ins from unfamiliar locations\nSafe to close without approval' },
      },
      delivery: {
        steps: ['Writing a short reply', 'Closing the ticket'],
        output: { title: 'Reply sent to Tom', body: 'You\'re unlocked. Check your phone for a one-time sign-in link, it works for 15 minutes. If this keeps happening, the password manager on your handheld can fill it in for you.\n\nTicket closed in one pass.' },
      },
    },
  },
];

const CUSTOM: TaskTemplate = {
  id: 'custom',
  title: 'Custom request',
  summary: 'Your own request, run through a generic script.',
  requester: 'You',
  priority: 'P2',
  risky: false,
  stages: {
    triage: {
      steps: ['Reading the request', 'Working out the category', 'Setting priority'],
      output: { title: 'Triage summary', body: 'Request: {title}\nType: General IT request\nPriority: P2\nNote: generic placeholder output, this request has no scripted scenario' },
    },
    planning: {
      steps: ['Looking for a matching runbook', 'Drafting steps'],
      output: { title: 'Work plan', body: '1. Confirm scope with the requester\n2. Carry out the change\n3. Verify the result\n4. Document what was done' },
    },
    execution: {
      steps: ['Confirming scope', 'Carrying out the change', 'Verifying the result'],
      output: { title: 'Change log', body: 'Scope confirmed\nChange carried out\nResult verified\n(Generic placeholder output)' },
    },
    review: {
      steps: ['Checking the work against the plan', 'Checking policy'],
      output: { title: 'Review result', body: 'Passed: work matches the plan\nNo policy concerns' },
    },
    delivery: {
      steps: ['Writing the reply', 'Closing the ticket'],
      output: { title: 'Reply sent', body: 'Your request "{title}" has been completed. Ticket closed.' },
    },
  },
};

export const getTemplate = (id: string): TaskTemplate => TEMPLATES.find((t) => t.id === id) ?? CUSTOM;

/** Picks the script an agent follows for this task and stage, including rework passes. */
export function scriptFor(task: Task, stage: WorkStage): StageScript {
  const tpl = getTemplate(task.templateId);
  let s = tpl.stages[stage];
  if (stage === 'execution' && task.rework > 0) {
    if (task.reworkBy === 'human' || !tpl.rework) {
      const note = task.humanNote || 'Changes requested by the supervisor';
      s = {
        steps: ['Reading the supervisor\'s note', 'Applying the requested changes', 'Re-checking the result'],
        output: { title: 'Change log, revised', body: `Supervisor asked: "${note}"\nRequested changes applied\nResult re-checked` },
      };
    } else s = tpl.rework.fix;
  }
  if (stage === 'review' && tpl.rework && task.rework === 0) s = tpl.rework.review;
  const fill = (x: string) => x.replaceAll('{title}', task.title);
  let body = fill(s.output.body);
  if (task.ruleRisk && tpl.id === 'custom') {
    if (stage === 'triage') body += `\nRisk check: ${task.ruleRisk}. This will stop for your approval.`;
    if (stage === 'planning') body += '\nRisky step: staged for approval, not applied until a person approves.';
    if (stage === 'execution') body += '\nRisky change: staged, not applied.';
    if (stage === 'review') body = `Work matches the plan.\nNeeds a person: ${task.ruleRisk.charAt(0).toLowerCase()}${task.ruleRisk.slice(1)}.`;
  }
  return { steps: s.steps.map(fill), output: { title: fill(s.output.title), body } };
}

/** True when the scripted reviewer will send this task back. */
export const reviewWillFail = (task: Task) => !!getTemplate(task.templateId).rework && task.rework === 0;

/** Title shown on each stage's output. */
export function outputTitle(task: Task, stage: WorkStage, verdict?: AIStageResult['verdict']): string {
  if (stage === 'triage') return 'Triage summary';
  if (stage === 'planning') return 'Work plan';
  if (stage === 'execution') return task.rework > 0 ? 'Change log, revised' : 'Change log';
  if (stage === 'review') return verdict === 'changes' ? 'Changes requested' : verdict === 'escalate' ? 'Review result: needs a person' : 'Review result';
  return task.requester === 'You' ? 'Reply to your request' : `Reply sent to ${task.requester}`;
}

/** The mix of requests used by "Simulate a busy morning". */
export const BUSY_MORNING = ['lockout', 'phishing', 'onboarding', 'lockout', 'vpn', 'lockout', 'phishing', 'lockout'];
