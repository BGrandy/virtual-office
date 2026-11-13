import { useEffect, useRef, useState } from 'react';
import { MODELS, errorMessage, modelLabel } from '../ai/anthropic';
import { actions, useUI } from '../state/store';

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
        <button className="inline-link" onClick={() => useUI.getState().setDialog('about')}>See what is working, simulated and proposed.</button>
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
  ['Workflow engine', 'Working', 'A tested state machine handles ownership, queues, priority, handoffs, rework, escalation and the approval gate.'],
  ['Supervisor controls', 'Working', 'Approve, request changes, hold, resume, reassign, cancel and the approval rule all change the run.'],
  ['Dashboard and guided tour', 'Working', 'Figures are computed live from the run, not made up.'],
  ['Saved state', 'Working', 'Progress is stored in your browser and survives a reload. "Reset demo" clears it.'],
  ['Live AI agents', 'Optional', 'With your own Claude API key, a real model triages, plans, writes the change log, reviews and replies. Off by default.'],
  ['Agent outputs without a key', 'Simulated', 'Scripted per scenario. Each output is labelled "Scripted" or with the model that wrote it.'],
  ['IT systems (directory, firewall, mail)', 'Simulated', 'Never connected, in either mode. Even live agents only describe what they would do.'],
  ['Server orchestration and multi-user view', 'Proposed', 'The engine moves to a server and streams the same events to every viewer.'],
  ['Real tool access, audit export, SLA alerts, ticketing integration', 'Proposed', 'Described in the README roadmap.'],
];

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
      <div className="row end">
        <button className="btn ghost" onClick={() => { if (confirm('Clear all requests and start over?')) actions.reset(); }}>Reset demo</button>
        <button className="btn ghost" onClick={() => useUI.getState().setDialog('ai')}>Connect a model</button>
        <button className="btn primary" onClick={onClose}>Back to the office</button>
      </div>
    </Dialog>
  );
}

function AIDialog({ onClose }: { onClose: () => void }) {
  const ai = useUI((s) => s.ai);
  const lastError = useUI((s) => s.aiError);
  const [key, setKey] = useState(ai.apiKey);
  const [model, setModel] = useState(ai.model);
  const [remember, setRemember] = useState(ai.remember);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await actions.testAndEnableAI(key.trim(), model, remember);
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
      </ul>

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
  return null;
}
