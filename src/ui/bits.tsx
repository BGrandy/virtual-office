import { AGENTS, PIPELINE, STAGE_META, actorName, getTemplate } from '../sim/data';
import type { Actor, AgentId, Stage, Task } from '../sim/types';
import { sim } from '../state/store';

export const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const actorColor = (a: Actor | 'archive') => (a === 'human' ? '#14233B' : a === 'archive' ? '#8FA1B8' : AGENTS[a as AgentId].color);

/** One plain-language line describing where a task is right now. */
export function statusText(t: Task): string {
  if (t.status === 'cancelled') return 'Cancelled by you';
  if (t.status === 'done') return `Completed in ${clock((t.completedAt ?? 0) - t.createdAt)}`;
  if (t.held) return 'On hold until you resume it';
  if (t.status === 'awaiting-approval') return 'Waiting for your approval';
  if (t.status === 'handoff' && t.next) {
    if (t.next.stage === 'done') return `${actorName(t.ownerId)} is filing it as completed`;
    if (t.next.kind === 'rework') return `${actorName(t.ownerId)} is sending it back to ${actorName(t.next.ownerId)}`;
    return `${actorName(t.ownerId)} is handing it to ${t.next.ownerId === 'human' ? 'you' : actorName(t.next.ownerId)}`;
  }
  if (t.status === 'queued') return `In ${actorName(t.ownerId)}'s tray, next up: ${STAGE_META[t.stage].label.toLowerCase()}`;
  return `${actorName(t.ownerId)}: ${STAGE_META[t.stage].verb.toLowerCase()}`;
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

export const riskReason = (t: Task) => getTemplate(t.templateId).riskReason ?? (sim.state.policy === 'all' ? 'Your approval rule sends every task to you' : undefined);
