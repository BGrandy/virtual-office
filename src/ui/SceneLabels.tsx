// Name tags, speech bubbles and ticket chips that float over the 3D scene.

import { AGENTS, AGENT_IDS, HUMAN, STAGE_META } from '../sim/data';
import { labelRef } from '../state/labelRegistry';
import { sim, useSim, useUI } from '../state/store';
import type { AgentId } from '../sim/types';

const ACTIVITY = { idle: 'idle', working: 'working', carrying: 'handing off', returning: 'walking back' } as const;

export function SceneLabels() {
  const s = useSim();
  const selected = useUI((st) => st.selected);
  const select = useUI((st) => st.select);
  const waiting = s.tasks.filter((t) => t.status === 'awaiting-approval').length;
  // Busy offices get crowded: speech bubbles only for the selected agent, or anyone when 2 or fewer are talking.
  const talking = AGENT_IDS.filter((id) => s.agents[id].say).length;
  return (
    <div className={`labels${talking > 2 ? ' crowded' : ''}`}>
      {AGENT_IDS.map((id) => {
        const p = AGENTS[id];
        const a = s.agents[id];
        const task = s.tasks.find((t) => t.id === a.taskId);
        const queue = s.tasks.filter((t) => t.ownerId === id && t.status === 'queued' && !t.held).length;
        const on = selected?.kind === 'agent' && selected.id === id;
        const holdsSelected = selected?.kind === 'task' && a.taskId === selected.id;
        return (
          <div key={id} className={`lbl${on || holdsSelected ? ' lbl-focus' : ''}`} ref={labelRef(`agent:${id}`)}>
            <button
              className={`tag${on ? ' is-selected' : ''}`}
              style={{ '--c': p.color } as React.CSSProperties}
              onClick={() => select({ kind: 'agent', id })}
              aria-label={`${p.name}, ${p.role}, ${ACTIVITY[a.activity]}`}
            >
              {a.say && (
                <span className="tag-say">
                  {a.say}
                  {a.activity === 'working' && task && <span className="bar"><span style={{ width: `${Math.round(task.progress * 100)}%` }} /></span>}
                </span>
              )}
              <span className="tag-name"><i className="dot" />{p.name}</span>
              <span className="tag-role">{p.role}</span>
              {queue > 0 && <span className="tag-queue">{queue} waiting</span>}
            </button>
          </div>
        );
      })}
      <div className="lbl" ref={labelRef('human')}>
        <button className={`tag tag-human${selected?.kind === 'human' ? ' is-selected' : ''}`} onClick={() => select({ kind: 'human' })}>
          {waiting > 0 && <span className="tag-alert">{waiting} waiting for you</span>}
          <span className="tag-name">{HUMAN.name}</span>
          <span className="tag-role">{HUMAN.role}</span>
        </button>
      </div>
      {s.tasks.map((t) => {
        const on = selected?.kind === 'task' && selected.id === t.id;
        if (t.status === 'cancelled' || (t.status === 'done' && !on)) return null;
        // In a stacked tray only the top request is labelled; the agent's tag shows how many wait.
        if (!on && t.status === 'queued' && t.ownerId !== 'human' && sim.queueFor(t.ownerId as AgentId).indexOf(t) > 0) return null;
        return (
          <div key={t.id} className="lbl" ref={labelRef(`task:${t.id}`)}>
            <button
              className={`chip${on ? ' is-selected' : ''}${t.status === 'awaiting-approval' ? ' is-alert' : ''}`}
              onClick={() => select({ kind: 'task', id: t.id })}
              aria-label={`${t.id}, ${STAGE_META[t.stage].label}`}
            >
              {t.id}{t.held && ' (on hold)'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
