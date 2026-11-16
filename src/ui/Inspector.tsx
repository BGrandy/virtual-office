import { useState } from 'react';
import { AGENTS, AGENT_IDS, STAGE_META, actorName } from '../sim/data';
import type { AgentId, Handoff, Task } from '../sim/types';
import { actions, sim, useSim, useUI } from '../state/store';
import { ActorChip, Pipeline, PriorityTag, SlaChip, clock, riskReason, statusText } from './bits';
import { taskAudit, taskEventsCsv } from '../sim/audit';
import { aiCalls, aiCost } from '../sim/metrics';
import { dollars } from '../ai/budget';
import { download, stamp } from './download';

export function PolicyControl() {
  const s = useSim();
  return (
    <div className="policy">
      <span className="policy-label">Stop for my approval on</span>
      <div className="seg" role="group" aria-label="Approval rule">
        <button className={s.policy === 'risky' ? 'on' : ''} aria-pressed={s.policy === 'risky'} onClick={() => actions.setPolicy('risky')}>Risky work only</button>
        <button className={s.policy === 'all' ? 'on' : ''} aria-pressed={s.policy === 'all'} onClick={() => actions.setPolicy('all')}>Every task</button>
      </div>
    </div>
  );
}

function ApprovalCard({ t }: { t: Task }) {
  const [note, setNote] = useState('');
  const review = [...t.outputs].reverse().find((o) => o.stage === 'review');
  return (
    <section className="approval">
      <h3>Your decision is needed</h3>
      <p className="due"><SlaChip task={t} now={sim.state.time} long /></p>
      <p className="why"><strong>Why it stopped:</strong> {(riskReason(t) ?? 'Flagged for approval').replace(/\.$/, '')}.</p>
      {review && <pre className="quote">{review.body}</pre>}
      <label htmlFor="note">Note for the team (optional)</label>
      <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: apply after 6 pm" />
      <div className="row">
        <button className="btn good" onClick={() => actions.approve(t.id, note)}>Approve</button>
        <button className="btn danger-ghost" onClick={() => actions.reject(t.id, note)}>Request changes</button>
      </div>
    </section>
  );
}

const trailText = (h: Handoff) => {
  const to = h.to === 'human' ? 'you' : actorName(h.to);
  const from = h.from === 'human' ? 'You' : actorName(h.from);
  if (h.kind === 'reassign') return `You reassigned it from ${from} to ${to}`;
  if (h.kind === 'rework') return `${from} sent it back to ${to}`;
  if (h.kind === 'approval') return `You approved it, on to ${to}`;
  if (h.to === 'archive') return `${from} filed it as completed`;
  return `${from} handed it to ${to}`;
};

function TaskInspector({ t }: { t: Task }) {
  const follow = useUI((s) => s.follow);
  const setFollow = useUI((s) => s.setFollow);
  const open = t.status !== 'done' && t.status !== 'cancelled';
  const canReassign = (t.status === 'queued' || t.status === 'active') && t.ownerId !== 'human';
  const owner = t.status === 'done' ? null : t.ownerId;
  return (
    <>
      <header className="insp-head">
        <div className="row between">
          <span className="task-id big">{t.id}</span>
          <span className="row-tags"><SlaChip task={t} now={sim.state.time} /><PriorityTag p={t.priority} /></span>
        </div>
        <h2>{t.title}</h2>
        <p className="meta">From {t.requester}, received at {clock(t.createdAt)}</p>
        {t.mode === 'ai' && <p className="mode-line"><span className="mode-tag">Live AI</span> Each step is written by a real model. Actions are still simulated.</p>}
      </header>

      <Pipeline task={t} labels />

      <section className="now-card">
        <div className="row between">
          <span className="now-text">{statusText(t)}</span>
          {owner && open && <ActorChip actor={owner} />}
        </div>
        {t.status === 'active' && <div className="bar big"><span style={{ width: `${Math.round(t.progress * 100)}%` }} /></div>}
        {t.rework > 0 && open && <p className="meta">Sent back for changes {t.rework === 1 ? 'once' : `${t.rework} times`}.</p>}
      </section>

      {t.status === 'awaiting-approval' && !t.held && <ApprovalCard t={t} />}

      {open && (
        <section className="controls">
          <h3>Step in</h3>
          <div className="row wrap">
            <button className={`btn ghost${follow ? ' on' : ''}`} aria-pressed={follow} onClick={() => setFollow(!follow)}>{follow ? 'Following in office' : 'Follow in office'}</button>
            <button className="btn ghost" onClick={() => actions.setHeld(t.id, !t.held)}>{t.held ? 'Resume' : 'Put on hold'}</button>
            <button className="btn ghost" onClick={() => { if (confirm(`Cancel ${t.id}? The agents will stop working on it.`)) actions.cancel(t.id); }}>Cancel request</button>
          </div>
          {canReassign && (
            <label className="reassign">
              <span>Give this step to</span>
              <select value="" onChange={(e) => e.target.value && actions.reassign(t.id, e.target.value as AgentId)}>
                <option value="">{actorName(t.ownerId)} (current)</option>
                {AGENT_IDS.filter((id) => id !== t.ownerId).map((id) => (
                  <option key={id} value={id}>{AGENTS[id].name}, {AGENTS[id].role.toLowerCase()}</option>
                ))}
              </select>
            </label>
          )}
        </section>
      )}

      <section>
        <h3>Work produced</h3>
        {aiCalls(t) > 0 && (
          <p className="meta cost-line">
            Live model cost for this request: <strong>{dollars(aiCost(t))}</strong> over {aiCalls(t)} {aiCalls(t) === 1 ? 'call' : 'calls'}. An estimate from published prices.
          </p>
        )}
        {t.outputs.length === 0 && <p className="empty">Each agent's output will appear here as it finishes its step.</p>}
        {[...t.outputs].reverse().map((o, i) => (
          <details key={t.outputs.length - i} className={`out${o.kind === 'changes' ? ' out-changes' : ''}`} open={i === 0}>
            <summary>
              <span className="out-title">{o.title}</span>
              <span className="out-meta"><ActorChip actor={o.by} small /> <time>{clock(o.t)}</time></span>
            </summary>
            <pre>{o.body}</pre>
            {o.source && o.source !== 'human' && (
              <p className={`src src-${o.source}`}>
                {o.source === 'ai' ? `Written by ${o.model ?? 'a live model'}` : o.source === 'fallback' ? `Scripted fallback: ${o.note ?? 'the model call failed'}` : 'Scripted'}
              </p>
            )}
          </details>
        ))}
      </section>

      <section>
        <h3>History</h3>
        <ol className="trail">
          <li><time>{clock(t.createdAt)}</time><span>{t.requester} sent the request, Iris received it</span></li>
          {[
            ...t.history.map((h, i) => ({ t: h.t, key: `h${i}`, el: (
              <li key={`h${i}`} className={h.kind === 'rework' ? 'is-rework' : h.kind === 'reassign' || h.kind === 'approval' ? 'is-you' : ''}>
                <time>{clock(h.t)}</time>
                <span>{trailText(h)}{h.note && h.kind !== 'reassign' ? <em> ({h.note})</em> : null}</span>
              </li>
            ) })),
            // Questions asked along the way. The request stayed with the asker.
            ...(t.consults ?? []).map((c, i) => ({ t: c.t, key: `c${i}`, el: (
              <li key={`c${i}`} className="is-consult">
                <time>{clock(c.t)}</time>
                <span>{actorName(c.from)} asked {actorName(c.to)}: “{c.question}” <em>{actorName(c.to)}: “{c.answer}”</em></span>
              </li>
            ) })),
          ].sort((x, y) => x.t - y.t).map((x) => x.el)}
        </ol>
      </section>

      <section className="audit">
        <h3>Audit record</h3>
        <p className="meta">Everything above, plus every logged event, as a file.</p>
        <div className="row wrap">
          <button className="btn ghost" onClick={() => download(`${t.id}-history-${stamp()}.json`, JSON.stringify(taskAudit(sim.state, t, new Date().toISOString()), null, 2), 'application/json')}>Download JSON</button>
          <button className="btn ghost" onClick={() => download(`${t.id}-events-${stamp()}.csv`, taskEventsCsv(sim.state, t), 'text/csv')}>Download CSV</button>
        </div>
      </section>
    </>
  );
}

function AgentInspector({ id }: { id: AgentId }) {
  const s = useSim();
  const select = useUI((st) => st.select);
  const p = AGENTS[id];
  const a = s.agents[id];
  const current = s.tasks.find((t) => t.id === a.taskId);
  const queue = sim.queueFor(id);
  const recent = s.events.filter((e) => e.actor === id).slice(-6).reverse();
  const state = a.activity === 'working' ? 'Working' : a.activity === 'carrying' ? 'Handing off' : a.activity === 'returning' ? 'Walking back to desk' : a.activity === 'consulting' ? `Asking ${AGENTS[a.consult!.with].name} a question` : a.reply ? 'Answering a question' : 'Idle, waiting for work';
  return (
    <>
      <header className="insp-head">
        <div className="agent-id">
          <span className="avatar" style={{ background: p.color }}><i /><i /></span>
          <div>
            <h2>{p.name}</h2>
            <p className="meta">{p.role}, step {['triage', 'planning', 'execution', 'review', '', 'delivery'].indexOf(p.stage) + 1} ({STAGE_META[p.stage].label})</p>
          </div>
        </div>
        <p>{p.blurb}</p>
      </header>

      <section className="now-card">
        <div className="row between"><span className="now-text">{state}</span><span className="meta">{a.stagesCompleted} {a.stagesCompleted === 1 ? "step" : "steps"} finished</span></div>
        {a.say && <p className="say">"{a.say}"</p>}
        {current && (
          <button className="link-row" onClick={() => select({ kind: 'task', id: current.id })}>
            <span className="task-id">{current.id}</span> {current.title}
          </button>
        )}
      </section>

      <section>
        <h3>Waiting in the tray</h3>
        {queue.length === 0 ? <p className="empty">Nothing waiting.</p> : (
          <ul className="plain">
            {queue.map((t) => (
              <li key={t.id}><button className="link-row" onClick={() => select({ kind: 'task', id: t.id })}><span className="task-id">{t.id}</span> {t.title}{t.held ? ' (on hold)' : ''}</button></li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>What {p.name} does</h3>
        <ul className="tags">{p.skills.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
      <section>
        <h3>Systems it may use</h3>
        <ul className="tags tags-tools">{p.tools.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="meta"><strong>Guardrail:</strong> {p.limits}</p>
        <p className="disclose">Simulated. In this demo {p.name} follows a script and touches no real systems. In production these would be tool permissions granted to a language model.</p>
      </section>

      <section>
        <h3>Recent activity</h3>
        {recent.length === 0 ? <p className="empty">No activity yet.</p> : (
          <ol className="trail">{recent.map((e) => <li key={e.id}><time>{clock(e.t)}</time><span>{e.text}</span></li>)}</ol>
        )}
      </section>
    </>
  );
}

function HumanInspector() {
  const s = useSim();
  const select = useUI((st) => st.select);
  const waiting = s.tasks.filter((t) => t.status === 'awaiting-approval');
  const mine = s.events.filter((e) => e.actor === 'human').slice(-6).reverse();
  return (
    <>
      <header className="insp-head">
        <div className="agent-id">
          <span className="avatar avatar-human" />
          <div><h2>You</h2><p className="meta">Supervisor, step 5 (Approve)</p></div>
        </div>
        <p>The agents do the routine work. You decide on anything risky, and you can step in on any request at any time.</p>
      </header>
      <section>
        <h3>Waiting for you</h3>
        {waiting.length === 0 ? <p className="empty">Nothing needs your approval right now.</p> : (
          <ul className="plain">
            {waiting.map((t) => (
              <li key={t.id}><button className="link-row is-alert" onClick={() => select({ kind: 'task', id: t.id })}><span className="task-id">{t.id}</span> {t.title}</button></li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>Approval rule</h3>
        <PolicyControl />
        <p className="meta">"Risky work only" lets agents finish routine requests such as password lockouts on their own. "Every task" is the cautious setting for a new team.</p>
      </section>
      <section>
        <h3>Ways to step in</h3>
        <ul className="bullets">
          <li><strong>Approve or request changes</strong> when a request stops at your console.</li>
          <li><strong>Put on hold</strong> to make agents skip a request, then resume it later.</li>
          <li><strong>Give a step to another agent</strong> if someone is overloaded.</li>
          <li><strong>Cancel</strong> a request that is no longer needed.</li>
        </ul>
      </section>
      <section>
        <h3>Your recent decisions</h3>
        {mine.length === 0 ? <p className="empty">You have not stepped in yet.</p> : (
          <ol className="trail">{mine.map((e) => <li key={e.id} className="is-you"><time>{clock(e.t)}</time><span>{e.text}</span></li>)}</ol>
        )}
      </section>
    </>
  );
}

export function Inspector() {
  const s = useSim();
  const selected = useUI((st) => st.selected);
  const select = useUI((st) => st.select);
  if (!selected) return null;
  const task = selected.kind === 'task' ? s.tasks.find((t) => t.id === selected.id) : undefined;
  if (selected.kind === 'task' && !task) return null;
  return (
    <aside className="panel right" aria-label="Details">
      <button className="close" onClick={() => select(null)} aria-label="Close details">×</button>
      <div className="panel-body">
        {selected.kind === 'agent' && <AgentInspector id={selected.id} />}
        {selected.kind === 'human' && <HumanInspector />}
        {task && <TaskInspector key={task.id} t={task} />}
      </div>
    </aside>
  );
}
