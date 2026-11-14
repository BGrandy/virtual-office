import { AGENTS, PIPELINE, SLA_REAL, STAGE_META, actorName, getTemplate } from '../sim/data';
import { slaInfo } from '../sim/sla';
import type { Actor, AgentId, Stage, Task } from '../sim/types';
import { sim } from '../state/store';

export const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** A length of time, e.g. "49s" or "2m 10s". */
export const duration = (n: number) => {
  if (n > 0 && n < 1) return 'under 1s';
  const s = Math.floor(n);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};

export const actorColor = (a: Actor | 'archive') => (a === 'human' ? '#14233B' : a === 'archive' ? '#8FA1B8' : AGENTS[a as AgentId].color);

/** One plain-language line describing where a task is right now. */
export function statusText(t: Task): string {
  if (t.status === 'cancelled') return 'Cancelled by you';
  if (t.status === 'done') return `Completed in ${duration((t.completedAt ?? 0) - t.createdAt)}`;
  if (t.held) return 'On hold until you resume it';
  if (t.status === 'awaiting-approval') return 'Waiting for your approval';
  if (t.status === 'handoff' && t.next) {
    if (t.next.stage === 'done') return `${actorName(t.ownerId)} is filing it as completed`;
    if (t.next.kind === 'rework') return `${actorName(t.ownerId)} is sending it back to ${actorName(t.next.ownerId)}`;
    return `${actorName(t.ownerId)} is handing it to ${t.next.ownerId === 'human' ? 'you' : actorName(t.next.ownerId)}`;
  }
  if (t.status === 'queued') return `In ${actorName(t.ownerId)}'s tray, next up: ${STAGE_META[t.stage].label.toLowerCase()}`;
  const pending = t.mode === 'ai' && t.stage !== 'approval' && t.stage !== 'done' && t.ai[`${t.stage}:${t.rework}`]?.status === 'pending' && t.progress >= 0.8;
  return `${actorName(t.ownerId)}: ${pending ? 'waiting for the model' : STAGE_META[t.stage].verb.toLowerCase()}`;
}

export function ActorChip({ actor, small }: { actor: Actor | 'archive'; small?: boolean }) {
  return (
    <span className={`actor${small ? ' actor-sm' : ''}`}>
      <i style={{ background: actorColor(actor) }} />
      {actor === 'human' ? 'You' : actorName(actor)}
    </span>
  );
}

/** The six-step pipeline. Shows finished, current and skipped steps for one task. */
export function Pipeline({ task, labels }: { task: Task; labels?: boolean }) {
  const idx = task.stage === 'done' ? PIPELINE.length : PIPELINE.indexOf(task.stage);
  const gated = sim.needsApproval(task) || task.history.some((h) => h.toStage === 'approval');
  return (
    <ol className={`pipe${labels ? ' pipe-labels' : ''}`} aria-label="Workflow progress">
      {PIPELINE.map((st: Stage, i) => {
        const skipped = st === 'approval' && !gated;
        const cls = skipped ? 'skip' : i < idx ? 'done' : i === idx ? (task.status === 'cancelled' ? 'stop' : 'now') : 'todo';
        return (
          <li key={st} className={cls} title={`${STAGE_META[st].label}${skipped ? ' (not needed for this task)' : ''}`}>
            <span className="pip" />
            {labels && <span className="pipe-label">{STAGE_META[st].label}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export const PriorityTag = ({ p }: { p: Task['priority'] }) => (
  <span className={`prio prio-${p}`} title={p === 'P1' ? 'Urgent' : p === 'P2' ? 'Normal' : 'Low'}>{p === 'P1' ? 'Urgent' : p === 'P2' ? 'Normal' : 'Low'}</span>
);

export const riskReason = (t: Task) => t.riskReason ?? getTemplate(t.templateId).riskReason ?? (sim.state.policy === 'all' ? 'Your approval rule sends every task to you' : undefined);

/** Countdown to the response-time target, or whether it was met. */
export function SlaChip({ task, now, long }: { task: Task; now: number; long?: boolean }) {
  const sla = slaInfo(task, now);
  if (!sla) return null;
  const left = Math.abs(sla.remaining);
  const text =
    sla.state === 'met' ? 'Met target'
    : sla.state === 'missed' ? `Missed by ${duration(left)}`
    : sla.state === 'breached' ? `Late by ${duration(left)}`
    : `Due in ${duration(sla.remaining)}`;
  return (
    <span className={`sla sla-${sla.state}`} title={`Response target: ${SLA_REAL[task.priority]} in a real desk (${duration(sla.target)} in this simulation)`}>
      {text}{long && ` (target ${SLA_REAL[task.priority]})`}
    </span>
  );
}
