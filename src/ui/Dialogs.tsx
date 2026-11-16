import { useEffect, useRef, useState } from 'react';
import { MODELS, errorMessage, modelLabel } from '../ai/anthropic';
import { LIMIT_OPTIONS, callsLeft, dollars, worstCaseCall } from '../ai/budget';
import { actions, useUI } from '../state/store';
import { ChecklistBody } from './Checklist';

function Dialog({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className={`dialog${wide ? ' dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

function Welcome({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Watch an IT request move through an AI team" onClose={onClose}>
      <p className="lead">
        Atrium is a virtual service desk. Five AI agents each own one step of the work, and they physically carry each request from desk to desk so you can see who has it. You are the supervisor.
      </p>
      <ol className="steps">
        <li><span><strong>Take the tour.</strong> Two minutes, one request from arrival to closed, with a short note at each step.</span></li>
        <li><span><strong>Step in.</strong> Risky work stops at your console until you approve it. You can also hold, reassign or cancel anything.</span></li>
        <li><span><strong>See the whole team.</strong> The dashboard shows where time goes and which desk is the bottleneck.</span></li>
      </ol>
      <p className="disclose">
        Agents follow scripted scenarios by default, and no real IT system is ever touched. You can connect your own Claude API key to have a real model do the thinking.{' '}
        <button className="inline-link" onClick={() => useUI.getState().setDialog('about')}>See what is working, simulated and proposed.</button>{' '}
        <button className="inline-link" onClick={() => useUI.getState().setDialog('checklist')}>See how it meets the assessment brief.</button>
      </p>
      <div className="row end">
        <button className="btn ghost" onClick={onClose}>Explore on my own</button>
        <button className="btn primary" onClick={actions.startTour}>Take the tour</button>
      </div>
    </Dialog>
  );
}

const ROWS: [string, 'Working' | 'Optional' | 'Simulated' | 'Proposed', string][] = [
  ['3D office, camera, selection, follow mode', 'Working', 'Real-time three.js scene you can orbit, zoom and click.'],
  ['Workflow engine', 'Working', 'A tested state machine handles ownership, queues, priority, handoffs, questions between agents, rework, escalation and the approval gate.'],
  ['Supervisor controls', 'Working', 'Approve, request changes, hold, resume, reassign, cancel and the approval rule all change the run.'],
  ['Dashboard and guided tour', 'Working', 'Figures are computed live from the run, not made up.'],
  ['Response-time targets and audit export', 'Working', 'Countdowns per priority, alerts when a request is at risk, and each request\'s full history as JSON or CSV.'],
  ['Value estimate', 'Working', 'Calculated from this run and assumptions you can edit. An estimate, not a measurement.'],
  ['Risk rules for typed requests', 'Working', 'Requests mentioning admin rights, sign-in security, deleting data, firewall changes, executive impersonation or changes for everyone always stop for approval, with or without a model.'],
  ['Saved state', 'Working', 'Progress is stored in your browser and survives a reload. "Reset demo" clears it.'],
  ['Live AI agents', 'Optional', 'With your own Claude API key, a real model triages, plans, writes the change log, reviews and replies. Off by default.'],
  ['Agent outputs without a key', 'Simulated', 'Scripted per scenario. Each output is labelled "Scripted" or with the model that wrote it.'],
  ['IT systems (directory, firewall, mail)', 'Simulated', 'Never connected, in either mode. Even live agents only describe what they would do.'],
  ['Server orchestration and multi-user view', 'Proposed', 'The engine moves to a server and streams the same events to every viewer.'],
  ['Real tool access and ticketing integration', 'Proposed', 'Described in the README roadmap.'],
];

function GraphicsSetting() {
  const quality = useUI((s) => s.quality);
  const autoLight = useUI((s) => s.autoLight);
  return (
    <div className="graphics">
      <span>Graphics</span>
      <div className="seg" role="group" aria-label="Graphics quality">
        {(['auto', 'full', 'light'] as const).map((q) => (
          <button key={q} className={quality === q ? 'on' : ''} aria-pressed={quality === q} onClick={() => actions.setQuality(q)}>
            {q === 'auto' ? 'Auto' : q === 'full' ? 'Full' : 'Light'}
          </button>
        ))}
      </div>
      <span className="meta">{quality === 'auto' ? (autoLight ? 'Running light (no shadows) for smoother motion on this device.' : 'Full detail. Drops to light automatically if motion gets choppy.') : quality === 'light' ? 'No shadows, lower resolution. Smoothest on older laptops.' : 'Shadows and full resolution.'}</span>
    </div>
  );
}

function About({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="What is real in this demo" onClose={onClose} wide>
      <p className="lead">Everything you can click works. What the agents write is scripted unless you connect a model, and no real IT system is touched either way.</p>
      <table className="truth">
        <tbody>
          {ROWS.map(([what, status, note]) => (
            <tr key={what}>
              <th scope="row">{what}</th>
              <td><span className={`st st-${status.toLowerCase()}`}>{status}</span></td>
              <td>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <GraphicsSetting />
      <div className="row end">
        <button className="btn ghost" onClick={() => { if (confirm('Clear all requests and start over?')) actions.reset(); }}>Reset demo</button>
        <button className="btn ghost" onClick={() => useUI.getState().setDialog('ai')}>Connect a model</button>
        <button className="btn primary" onClick={onClose}>Back to the office</button>
      </div>
    </Dialog>
  );
}

function SpendMeter({ usage, model, limit }: { usage: { calls: number; cost: number; inputTokens: number; outputTokens: number }; model: string; limit: number }) {
  const share = Math.min(1, usage.cost / limit);
  return (
    <div className="spend">
      <div className="row between">
        <span><strong>{dollars(usage.cost)}</strong> of {dollars(limit)} used on this device</span>
        {usage.calls > 0 && <button type="button" className="text-btn" onClick={actions.resetUsage}>Reset counter</button>}
      </div>
      <span className="spend-bar"><span style={{ width: `${share * 100}%` }} className={share > 0.8 ? 'hot' : ''} /></span>
      <span className="meta">{usage.calls} {usage.calls === 1 ? 'call' : 'calls'}, {(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens. Room for at least {Math.floor(callsLeft(usage, model, limit) / 5)} more requests. An estimate from published prices; your Console billing page is the real record.</span>
    </div>
  );
}

function AIDialog({ onClose }: { onClose: () => void }) {
  const ai = useUI((s) => s.ai);
  const lastError = useUI((s) => s.aiError);
  const [key, setKey] = useState(ai.apiKey);
  const [model, setModel] = useState(ai.model);
  const [remember, setRemember] = useState(ai.remember);
  const [limit, setLimit] = useState(ai.limit);
  const usage = useUI((s) => s.usage);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await actions.testAndEnableAI(key.trim(), model, remember, limit);
      setMsg({ ok: true, text: `Connected. New requests will be worked by ${modelLabel(model)}.` });
    } catch (e) {
      setMsg({ ok: false, text: `Could not connect: ${errorMessage(e)}. Nothing was changed.` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Let a real model do the thinking" onClose={onClose}>
      <p className="lead">
        With your own Claude API key, each agent's step becomes a real model call. Iris reads your request and sets the priority, Atlas decides whether the plan is risky, Sage can send work back, and Echo writes the reply. Type any request you like.
      </p>
      <ul className="bullets ai-facts">
        <li><strong>The rules stay in charge.</strong> The model can suggest a priority, flag risk or ask for changes. It cannot skip review, approve its own work or loop: the workflow engine enforces that.</li>
        <li><strong>Still no real systems.</strong> Agents describe what they would do. Nothing is changed anywhere.</li>
        <li><strong>Your key stays with you.</strong> It is sent only from this browser to api.anthropic.com. There is no Atrium server. A request makes five short calls, a fraction of a cent with Haiku.</li>
        <li><strong>Spending is capped.</strong> Every call's real token use is added up on this device, and no call is made that could take the total past your limit. At the limit, live AI switches itself off.</li>
      </ul>
      <SpendMeter usage={usage} model={ai.enabled ? ai.model : model} limit={ai.enabled ? ai.limit : limit} />

      {ai.enabled ? (
        <div className="ai-on">
          <p><span className="st st-working">On</span> New requests use <strong>{modelLabel(ai.model)}</strong>. Requests already in progress keep the mode they started with.</p>
          {lastError && <p className="err">Last call failed: {lastError}. That step used its scripted version.</p>}
          <div className="row end">
            <button className="btn ghost" onClick={() => { actions.forgetAI(); setKey(''); }}>Turn off and forget key</button>
            <button className="btn ghost" onClick={actions.disableAI}>Turn off</button>
            <button className="btn primary" onClick={onClose}>Back to the office</button>
          </div>
        </div>
      ) : (
        <form className="ai-form" onSubmit={(e) => { e.preventDefault(); if (key.trim()) connect(); }}>
          <label htmlFor="ai-key">Anthropic API key</label>
          <div className="row">
            <input id="ai-key" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." autoComplete="off" spellCheck={false} />
            <button type="button" className="btn ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <p className="meta">Get one from the <a href="https://platform.claude.com/" target="_blank" rel="noreferrer">Claude Console</a>.</p>
          <label htmlFor="ai-model">Model</label>
          <select id="ai-model" value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}: {m.note}</option>)}
          </select>
          <label htmlFor="ai-limit">Spending limit on this device</label>
          <select id="ai-limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {LIMIT_OPTIONS.map((l) => (
              <option key={l} value={l}>{dollars(l)}: at least {Math.floor(l / worstCaseCall(model) / 5)} requests with {modelLabel(model)}</option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Remember the key on this device. Otherwise it is forgotten when you close this tab.</span>
          </label>
          {msg && <p className={msg.ok ? 'ok' : 'err'} role="status">{msg.text}</p>}
          <div className="row end">
            <button type="button" className="btn ghost" onClick={onClose}>Keep it simulated</button>
            <button type="submit" className="btn primary" disabled={!key.trim() || busy}>{busy ? 'Testing the key' : 'Test key and turn on'}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function Dialogs() {
  const dialog = useUI((s) => s.dialog);
  const setDialog = useUI((s) => s.setDialog);
  const close = () => setDialog(null);
  if (dialog === 'welcome') return <Welcome onClose={close} />;
  if (dialog === 'about') return <About onClose={close} />;
  if (dialog === 'ai') return <AIDialog onClose={close} />;
  if (dialog === 'checklist') return <Dialog title="Assessment checklist" onClose={close} wide><ChecklistBody /></Dialog>;
  return null;
}
