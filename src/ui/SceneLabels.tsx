// Name tags, speech bubbles and ticket chips that float over the 3D scene.

import { AGENTS, AGENT_IDS, HUMAN, STAGE_META } from '../sim/data';
import { labelRef } from '../state/labelRegistry';
import { useSim, useUI } from '../state/store';
import { slaInfo } from '../sim/sla';

const ACTIVITY = { idle: 'idle', working: 'working', carrying: 'handing off', returning: 'walking back', consulting: 'asking a question' } as const;

export function SceneLabels() {
  const s = useSim();
  const selected = useUI((st) => st.selected);
  const select = useUI((st) => st.select);
  const waiting = s.tasks.filter((t) => t.status === 'awaiting-approval').length;
  const done = s.tasks.filter((t) => t.status === 'done').length;
  return (
    <div className="labels">
      {AGENT_IDS.map((id) => {
        const p = AGENTS[id];
        const a = s.agents[id];
        const task = s.tasks.find((t) => t.id === a.taskId);
        const on = selected?.kind === 'agent' && selected.id === id;
        const holdsSelected = selected?.kind === 'task' && a.taskId === selected.id;
        const asking = a.consult?.phase === 'talking' && !!a.say;
        const status = !asking && !a.reply ? a.say : undefined;
        return (
          // A conversation between two agents is always shown, even in a crowded office.
          <div key={id} className={`lbl${on || holdsSelected || a.reply || a.consult?.phase === 'talking' ? ' lbl-focus' : ''}`} ref={labelRef(`agent:${id}`)}>
            <button
              className={`tag${on ? ' is-selected' : ''}`}
              style={{ '--c': p.color } as React.CSSProperties}
              onClick={() => select({ kind: 'agent', id })}
              aria-label={`${p.name}, ${p.role}, ${ACTIVITY[a.activity]}`}
            >
              {/* Only a conversation between two agents gets a bubble. Everything else an agent
                  "says" takes the place of its role under the name, so labels never stack up. */}
              {a.reply && <span className="tag-say tag-reply">{a.reply}</span>}
              {asking && <span className="tag-say tag-ask">{a.say}</span>}
              <span className="tag-name"><i className="dot" />{p.name}</span>
              {status ? (
                <span key="status" className="tag-line tag-status">
                  <span className="tag-status-text">{status}</span>
                  {a.activity === 'working' && task && <span className="bar"><span style={{ width: `${Math.round(task.progress * 100)}%` }} /></span>}
                </span>
              ) : (
                <span key="role" className="tag-line tag-role">{p.role}</span>
              )}
            </button>
          </div>
        );
      })}
      {done > 0 && (
        <div className="lbl" ref={labelRef('archive')}>
          <span className="tag tag-archive"><span className="tag-name">{done} completed</span></span>
        </div>
      )}
      {AGENT_IDS.map((id) => {
        const waiting = s.tasks.filter((t) => t.ownerId === id && t.status === 'queued' && !t.held).length;
        return waiting > 0 ? (
          <div key={`more-${id}`} className="lbl" ref={labelRef(`tower:${id}`)}>
            <span className="tag tag-more" title={waiting > 10 ? 'Ten are shown on the desk' : undefined}><span className="tag-name">{waiting} waiting</span></span>
          </div>
        ) : null;
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
        // Requests waiting in a desk tower are counted by the tower's tag instead of labelled one by one.
        if (!on && t.status === 'queued' && t.ownerId !== 'human') return null;
        return (
          <div key={t.id} className="lbl" ref={labelRef(`task:${t.id}`)}>
            <button
              className={`chip${on ? ' is-selected' : ''}${t.status === 'awaiting-approval' ? ' is-alert' : ''} chip-${slaInfo(t, s.time)?.state ?? 'none'}`}
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
