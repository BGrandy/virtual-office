import { useEffect, useState } from 'react';
import { modelLabel } from '../ai/anthropic';
import { dollars } from '../ai/budget';
import { TEMPLATES } from '../sim/data';
import type { SimEvent, Task } from '../sim/types';
import { actions, isNarrow, useSim, useUI } from '../state/store';
import { Dashboard } from './Dashboard';
import { Pipeline, PriorityTag, SlaChip, clock, duration, statusText } from './bits';

export function TopBar() {
  const s = useSim();
  const ai = useUI((st) => st.ai);
  const usage = useUI((st) => st.usage);
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
      {ai.enabled ? (
        <button className="sim-badge is-live" onClick={() => setDialog('ai')} title="Live AI settings">
          <i className="live-dot" /><span>Live AI<span className="hide-narrow">: {modelLabel(ai.model)}, {dollars(usage.cost)} of {dollars(ai.limit)} used</span></span>
        </button>
      ) : (
        <button className="sim-badge" onClick={() => setDialog('about')} title="What is real and what is simulated">
          <span className="hide-xs">Simulated demo</span><span className="only-xs">Simulated</span><span className="hide-narrow">. What's real?</span>
        </button>
      )}
      <dl className="stats hide-narrow">
        <div><dt>In progress</dt><dd>{live.length}</dd></div>
        <div className={waiting ? 'alert' : ''}><dt>Need you</dt><dd>{waiting}</dd></div>
        <div><dt>Completed</dt><dd>{done.length}</dd></div>
        <div><dt>Avg time to close</dt><dd>{done.length ? duration(avg) : 'n/a'}</dd></div>
      </dl>
      <div className="spacer" />
      <div className="seg" role="group" aria-label="Simulation speed">
        <button className={s.paused ? 'on' : ''} onClick={() => actions.setPaused(!s.paused)} aria-pressed={s.paused}>
          {s.paused ? 'Resume' : 'Pause'}
        </button>
        {[1, 2, 4].map((n) => (
          <button key={n} className={`${!s.paused && s.speed === n ? 'on' : ''}${n === 4 ? ' hide-narrow' : ''}`} onClick={() => { actions.setSpeed(n); actions.setPaused(false); }} aria-pressed={s.speed === n}>
            {n}x
          </button>
        ))}
      </div>
      {!ai.enabled && <button className="btn ghost hide-narrow" onClick={() => setDialog('ai')}>Connect AI</button>}
      <button className="btn ghost hide-narrow" onClick={resetCamera}>Reset view</button>
      <button className="btn ghost" onClick={() => setDialog('welcome')} aria-label="Guide"><span className="hide-xs">Guide</span><span className="only-xs" aria-hidden="true">?</span></button>
    </header>
  );
}

function TaskRow({ t }: { t: Task }) {
  const now = useSim().time;
  const selected = useUI((s) => s.selected?.kind === 'task' && s.selected.id === t.id);
  const select = useUI((s) => s.select);
  return (
    <li>
      <button className={`task-row${selected ? ' is-selected' : ''}${t.status === 'awaiting-approval' ? ' is-alert' : ''}`} onClick={() => select({ kind: 'task', id: t.id })}>
        <span className="task-top">
          <span className="task-id">{t.id}{t.mode === 'ai' && <span className="mode-tag">Live AI</span>}</span>
          <span className="row-tags"><SlaChip task={t} now={now} /><PriorityTag p={t.priority} /></span>
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
  const ai = useUI((s) => s.ai.enabled);
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
                  {tpl.risky ? 'Stops for your approval' : tpl.rework ? (ai ? 'Reviewer may send it back' : 'Reviewer sends it back once') : 'Runs without stopping'}
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
          <input id="custom-req" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Printer on floor 2 is offline" maxLength={120} />
          <button className="btn" type="submit" disabled={!custom.trim()}>Send</button>
        </div>
        <p className="hint">
          {ai ? 'The live model reads exactly what you type.' : (
            <>Typed requests get generic placeholder output.{' '}<button type="button" className="inline-link" onClick={() => useUI.getState().setDialog('ai')}>Connect a model</button> to have them understood.</>
          )}
        </p>
      </form>
      <div className="busy">
        <button className="btn ghost" onClick={() => { actions.busyMorning(); useUI.getState().setTab('dashboard'); }}>Simulate a busy morning</button>
        <span className="hint">Eight requests at once. Watch the queues build on the dashboard.</span>
      </div>
    </section>
  );
}

const EVENT_TONE: Partial<Record<SimEvent['type'], string>> = {
  created: 'new', completed: 'good', approved: 'good', 'approval-requested': 'alert', rejected: 'alert', rework: 'alert', 'ai-error': 'alert', 'sla-breach': 'alert',
  held: 'you', resumed: 'you', cancelled: 'you', reassigned: 'you', policy: 'you', handoff: 'move',
};

function Feed() {
  const s = useSim();
  const select = useUI((st) => st.select);
  const events = s.events.slice(-150).reverse();
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
    <aside className="panel left" aria-label="Requests, activity and dashboard">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>
          Requests{need.length > 0 && <span className="count">{need.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'dashboard'} className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button role="tab" aria-selected={tab === 'feed'} className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>Log</button>
      </div>
      <div className="panel-body">
        {tab === 'feed' ? <Feed /> : tab === 'dashboard' ? <Dashboard /> : (
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

/** True when the main way of pointing is a finger (phone, tablet) rather than a mouse or trackpad. */
function useTouchFirst(): boolean {
  const query = '(pointer: coarse)';
  const [touch, setTouch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia(query);
    const on = () => setTouch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return touch;
}

/** Navigation help, replaced for a few seconds when graphics drop to light mode. */
function NavHint() {
  const autoLight = useUI((st) => st.autoLight);
  const hasSelection = useUI((st) => st.selected !== null);
  const touch = useTouchFirst();
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    if (!autoLight) return;
    setShownAt(Date.now());
    const id = setTimeout(() => force((n) => n + 1), 7000);
    return () => clearTimeout(id);
  }, [autoLight]);
  if (shownAt && Date.now() - shownAt < 7000) {
    return (
      <div className="nav-hint is-note" role="status">
        Switched to light graphics for smoother motion.{' '}
        <button className="inline-link" onClick={() => useUI.getState().setDialog('about')}>Change</button>
      </div>
    );
  }
  // Once something is selected the details panel is open and the hint has done its job.
  if (hasSelection) return null;
  return (
    <div className="nav-hint" aria-hidden="true">
      {touch
        ? 'Drag to look around. Pinch to zoom. Drag with two fingers to move. Tap an agent to see what they’re doing, or any box to open that request. Each box is one request.'
        : 'Drag to look around. Scroll to zoom. Right-drag to move. Click an agent to see what they’re doing, or any box to open that request. Each box is one request.'}
    </div>
  );
}

/** Bottom nudge: tells the supervisor when something is blocked on them. */
export function AttentionBar() {
  const s = useSim();
  const selected = useUI((st) => st.selected);
  const select = useUI((st) => st.select);
  const tour = useUI((st) => st.tour);
  const sheetOpen = useUI((st) => st.leftOpen || !!st.selected);
  if (tour) return null;
  // On a phone an open sheet already shows the count, so the banner would only cover it.
  if (sheetOpen && isNarrow()) return null;
  const waiting = s.tasks.filter((t) => t.status === 'awaiting-approval');
  const first = waiting[0];
  if (!first || (selected?.kind === 'task' && waiting.some((t) => t.id === selected.id))) {
    return <NavHint />;
  }
  return (
    <div className="attention" role="status">
      <span><strong>{waiting.length === 1 ? `${first.id} is waiting for your approval.` : `${waiting.length} requests are waiting for your approval.`}</strong> <span className="hide-xs">{waiting.length === 1 ? 'It is paused until you decide.' : 'They are paused until you decide.'}</span></span>
      <button className="btn danger" onClick={() => select({ kind: 'task', id: first.id })}>Review {first.id}</button>
    </div>
  );
}
