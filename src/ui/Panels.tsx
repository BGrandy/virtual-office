import { useState } from 'react';
import { TEMPLATES } from '../sim/data';
import type { SimEvent, Task } from '../sim/types';
import { actions, useSim, useUI } from '../state/store';
import { Pipeline, PriorityTag, clock, statusText } from './bits';

export function TopBar() {
  const s = useSim();
  const { setDialog, resetCamera, toggleLeft } = useUI.getState();
  const live = s.tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const waiting = s.tasks.filter((t) => t.status === 'awaiting-approval').length;
  const done = s.tasks.filter((t) => t.status === 'done');
  const avg = done.length ? done.reduce((n, t) => n + (t.completedAt! - t.createdAt), 0) / done.length : 0;
  return (
    <header className="topbar">
      <button className="icon-btn only-narrow" onClick={toggleLeft} aria-label="Show or hide the request panel">☰</button>
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#14233B" /><path d="M8 23 16 8l8 15" fill="none" stroke="#FFC53D" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Atrium</span>
      </div>
      <button className="sim-badge" onClick={() => setDialog('about')} title="What is real and what is simulated">
        Simulated demo<span className="hide-narrow">, no live AI. What's real?</span>
      </button>
      <dl className="stats hide-narrow">
        <div><dt>In progress</dt><dd>{live.length}</dd></div>
        <div className={waiting ? 'alert' : ''}><dt>Need you</dt><dd>{waiting}</dd></div>
        <div><dt>Completed</dt><dd>{done.length}</dd></div>
        <div><dt>Avg time</dt><dd>{done.length ? clock(avg) : 'n/a'}</dd></div>
      </dl>
      <div className="spacer" />
      <div className="seg" role="group" aria-label="Simulation speed">
        <button className={s.paused ? 'on' : ''} onClick={() => actions.setPaused(!s.paused)} aria-pressed={s.paused}>
          {s.paused ? 'Resume' : 'Pause'}
        </button>
        {[1, 2, 4].map((n) => (
          <button key={n} className={!s.paused && s.speed === n ? 'on' : ''} onClick={() => { actions.setSpeed(n); actions.setPaused(false); }} aria-pressed={s.speed === n}>
            {n}x
          </button>
        ))}
      </div>
      <button className="btn ghost hide-narrow" onClick={resetCamera}>Reset view</button>
      <button className="btn ghost" onClick={() => setDialog('welcome')}>Guide</button>
    </header>
  );
}

function TaskRow({ t }: { t: Task }) {
  const selected = useUI((s) => s.selected?.kind === 'task' && s.selected.id === t.id);
  const select = useUI((s) => s.select);
  return (
    <li>
      <button className={`task-row${selected ? ' is-selected' : ''}${t.status === 'awaiting-approval' ? ' is-alert' : ''}`} onClick={() => select({ kind: 'task', id: t.id })}>
        <span className="task-top">
          <span className="task-id">{t.id}</span>
          <PriorityTag p={t.priority} />
        </span>
        <span className="task-title">{t.title}</span>
        <Pipeline task={t} />
        <span className="task-status">{statusText(t)}</span>
      </button>
    </li>
  );
}

function NewRequest({ compact }: { compact: boolean }) {
  const [custom, setCustom] = useState('');
  const select = useUI((s) => s.select);
  const start = (id: string, title?: string) => {
    const t = actions.createTask(id, title);
    select({ kind: 'task', id: t.id });
  };
  return (
    <section className="new-req">
      <h2>Start a request</h2>
      {!compact && <p className="hint">Pick a scenario. It arrives at the mail slot on the left of the office.</p>}
      <ul className="tpl-list">
        {TEMPLATES.map((tpl) => (
          <li key={tpl.id}>
            <button className="tpl" onClick={() => start(tpl.id)} title={tpl.summary}>
              <span className="tpl-title">{tpl.title}</span>
              {!compact && <span className="tpl-sum">{tpl.summary}</span>}
              <span className="tpl-tags">
                <PriorityTag p={tpl.priority} />
                <span className={`flag ${tpl.risky ? 'flag-risk' : tpl.rework ? 'flag-loop' : 'flag-auto'}`}>
                  {tpl.risky ? 'Stops for your approval' : tpl.rework ? 'Reviewer sends it back once' : 'Runs without stopping'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="custom"
        onSubmit={(e) => {
          e.preventDefault();
          if (!custom.trim()) return;
          start('custom', custom);
          setCustom('');
        }}
      >
        <label htmlFor="custom-req">Or type your own</label>
        <div className="row">
          <input id="custom-req" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Printer on floor 2 is offline" maxLength={80} />
          <button className="btn" type="submit" disabled={!custom.trim()}>Send</button>
        </div>
      </form>
    </section>
  );
}

const EVENT_TONE: Partial<Record<SimEvent['type'], string>> = {
  created: 'new', completed: 'good', approved: 'good', 'approval-requested': 'alert', rejected: 'alert', rework: 'alert',
  held: 'you', resumed: 'you', cancelled: 'you', reassigned: 'you', policy: 'you', handoff: 'move',
};

function Feed() {
  const s = useSim();
  const select = useUI((st) => st.select);
  const events = s.events.slice(-120).reverse();
  if (!events.length) return <p className="empty">Nothing has happened yet. Start a request to see every step logged here.</p>;
  return (
    <ol className="feed">
      {events.map((e) => (
        <li key={e.id} className={`ev ev-${EVENT_TONE[e.type] ?? 'plain'}`}>
          <time>{clock(e.t)}</time>
          {e.taskId ? (
            <button onClick={() => select({ kind: 'task', id: e.taskId! })}>{e.text}</button>
          ) : (
            <span>{e.text}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function LeftPanel() {
  const s = useSim();
  const tab = useUI((st) => st.tab);
  const open = useUI((st) => st.leftOpen);
  const setTab = useUI((st) => st.setTab);
  if (!open) return null;
  const need = s.tasks.filter((t) => t.status === 'awaiting-approval');
  const live = s.tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && t.status !== 'awaiting-approval');
  const closed = s.tasks.filter((t) => t.status === 'done' || t.status === 'cancelled').reverse();
  return (
    <aside className="panel left" aria-label="Requests and activity">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>
          Requests{need.length > 0 && <span className="count">{need.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'feed'} className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>Activity log</button>
      </div>
      <div className="panel-body">
        {tab === 'feed' ? (
          <Feed />
        ) : (
          <>
            {need.length > 0 && (
              <section>
                <h2 className="alert-h">Needs you</h2>
                <ul className="task-list">{need.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
              </section>
            )}
            {live.length > 0 && (
              <section>
                <h2>In progress</h2>
                <ul className="task-list">{live.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
              </section>
            )}
            <NewRequest compact={s.tasks.length > 0} />
            {closed.length > 0 && (
              <section>
                <h2>Finished</h2>
                <ul className="task-list">{closed.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/** Bottom nudge: tells the supervisor when something is blocked on them. */
export function AttentionBar() {
  const s = useSim();
  const selected = useUI((st) => st.selected);
  const select = useUI((st) => st.select);
  const waiting = s.tasks.filter((t) => t.status === 'awaiting-approval');
  const first = waiting[0];
  if (!first || (selected?.kind === 'task' && waiting.some((t) => t.id === selected.id))) {
    return (
      <div className="nav-hint" aria-hidden="true">Drag to look around. Scroll to zoom. Right-drag to move. Click an agent or a box.</div>
    );
  }
  return (
    <div className="attention" role="status">
      <span><strong>{waiting.length === 1 ? `${first.id} is waiting for your approval.` : `${waiting.length} requests are waiting for your approval.`}</strong> The agents have stopped until you decide.</span>
      <button className="btn danger" onClick={() => select({ kind: 'task', id: first.id })}>Review {first.id}</button>
    </div>
  );
}
