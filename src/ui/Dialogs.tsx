import { useEffect, useRef } from 'react';
import { actions, useUI } from '../state/store';

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

function Welcome({ onClose }: { onClose: () => void }) {
  const guided = () => {
    const t = actions.createTask('onboarding');
    useUI.getState().setTab('tasks');
    useUI.getState().select({ kind: 'task', id: t.id });
    onClose();
  };
  return (
    <Dialog title="Watch an IT request move through an AI team" onClose={onClose}>
      <p className="lead">
        Atrium is a virtual service desk. Five AI agents each own one step of the work, and they physically carry each request from desk to desk so you can see who has it. You are the supervisor.
      </p>
      <ol className="steps">
        <li><span><strong>Start a request.</strong> Pick a scenario on the left, such as a new-hire setup or a VPN outage.</span></li>
        <li><span><strong>Follow it.</strong> Watch the coloured box travel: request, plan, execute, review, approve, complete. Click any agent or box for details.</span></li>
        <li><span><strong>Step in.</strong> Risky work stops at your console until you approve it. You can also hold, reassign or cancel anything.</span></li>
      </ol>
      <p className="disclose">
        This is a simulation. Agents follow scripted scenarios, and no AI model or real IT system is called.{' '}
        <button className="inline-link" onClick={() => useUI.getState().setDialog('about')}>See what is working, simulated and proposed.</button>
      </p>
      <div className="row end">
        <button className="btn ghost" onClick={onClose}>Look around first</button>
        <button className="btn primary" onClick={guided}>Run the guided example</button>
      </div>
    </Dialog>
  );
}

const ROWS: [string, 'Working' | 'Simulated' | 'Proposed', string][] = [
  ['3D office, camera, selection, follow mode', 'Working', 'Real-time three.js scene you can orbit, zoom and click.'],
  ['Workflow engine', 'Working', 'A tested state machine handles ownership, queues, priority, handoffs, rework and the approval gate.'],
  ['Supervisor controls', 'Working', 'Approve, request changes, hold, resume, reassign, cancel and the approval rule all change the run.'],
  ['Saved state', 'Working', 'Progress is stored in your browser and survives a reload. "Reset demo" clears it.'],
  ['Agent reasoning and outputs', 'Simulated', 'Steps, timings and written outputs are scripted per scenario. No language model is called.'],
  ['IT systems (directory, firewall, mail)', 'Simulated', 'Nothing is connected. Names such as FW-2291 are invented.'],
  ['Custom typed requests', 'Simulated', 'Run through a generic placeholder script, not understood by an AI.'],
  ['Live model-backed agents', 'Proposed', 'Each step becomes a model call with scoped tool permissions.'],
  ['Server orchestration and multi-user view', 'Proposed', 'The engine moves to a server and streams the same events to every viewer.'],
  ['Audit export, SLA alerts, ticketing integration', 'Proposed', 'Described in the README roadmap.'],
];

function About({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="What is real in this demo" onClose={onClose}>
      <p className="lead">Everything you can click works. What the agents "think" and "do" is scripted mock data.</p>
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
        <button className="btn primary" onClick={onClose}>Back to the office</button>
      </div>
    </Dialog>
  );
}

export function Dialogs() {
  const dialog = useUI((s) => s.dialog);
  const setDialog = useUI((s) => s.setDialog);
  if (dialog === 'welcome') return <Welcome onClose={() => setDialog(null)} />;
  if (dialog === 'about') return <About onClose={() => setDialog(null)} />;
  return null;
}
