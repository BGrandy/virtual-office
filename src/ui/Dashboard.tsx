// Manager view. Every figure is computed live from the run by sim/metrics.ts.

import { useState } from 'react';
import { AGENTS } from '../sim/data';
import { DEFAULT_VALUE, computeMetrics, valueEstimate, type StageStat, type ValueAssumptions } from '../sim/metrics';
import { allRequestsCsv } from '../sim/audit';
import { download, stamp } from './download';
import { actions, sim, useSim, useUI } from '../state/store';
import { duration } from './bits';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const secs = duration;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

interface Tip { x: number; y: number; text: string }

function StageChart({ stages, onTip }: { stages: StageStat[]; onTip: (t: Tip | null) => void }) {
  const rows = stages.filter((s) => s.samples > 0);
  const max = Math.max(1, ...rows.map((s) => s.wait + s.work));
  if (!rows.length) return <p className="empty">Bars appear as requests finish each step.</p>;
  const tip = (e: React.MouseEvent, text: string) => {
    const box = (e.currentTarget.closest('.dash') as HTMLElement).getBoundingClientRect();
    onTip({ x: e.clientX - box.left, y: e.clientY - box.top, text });
  };
  return (
    <ul className="hbars" aria-label="Average time per step, split into waiting and working">
      {rows.map((s) => {
        const total = s.wait + s.work;
        return (
          <li key={s.stage}>
            <span className="hb-label">{s.label}<small>{s.owner}</small></span>
            <span className="hb-track">
              {s.wait > 0.05 && (
                <span
                  className={`hb-seg hb-wait${s.work <= 0.05 ? ' hb-end' : ''}`}
                  style={{ width: `${(s.wait / max) * 100}%` }}
                  onMouseMove={(e) => tip(e, `${s.label}: waited ${secs(s.wait)} on average${s.stage === 'approval' ? ' for you' : ` before ${s.owner} started`}`)}
                  onMouseLeave={() => onTip(null)}
                />
              )}
              {s.work > 0.05 && (
                <span
                  className="hb-seg hb-work hb-end"
                  style={{ width: `${(s.work / max) * 100}%` }}
                  onMouseMove={(e) => tip(e, `${s.label}: ${s.owner} worked ${secs(s.work)} on average`)}
                  onMouseLeave={() => onTip(null)}
                />
              )}
              <span className="hb-val">{secs(total)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const hours = (n: number) => `${n >= 10 ? Math.round(n).toLocaleString() : n.toFixed(1)} h`;

const FIELDS: { key: keyof ValueAssumptions; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'manualMinutes', label: 'A request done fully by hand', unit: 'min', min: 1, max: 600, step: 1 },
  { key: 'touchMinutes', label: 'Each time a person steps in', unit: 'min', min: 0, max: 120, step: 1 },
  { key: 'hourlyCost', label: 'Cost of an hour of IT staff time', unit: '$', min: 0, max: 500, step: 1 },
  { key: 'requestsPerDay', label: 'Requests per working day', unit: '', min: 1, max: 5000, step: 1 },
];

/** Turns the run into time and money saved, from assumptions the viewer can change. */
function ValuePanel() {
  const s = useSim();
  const a = useUI((st) => st.value);
  const v = valueEstimate(s, a);
  const changed = (Object.keys(DEFAULT_VALUE) as (keyof ValueAssumptions)[]).some((k) => a[k] !== DEFAULT_VALUE[k]);
  return (
    <section className="value">
      <h2>Value of this setup</h2>
      {v ? (
        <>
          <p className="value-lead">
            A person spends about <strong>{v.humanMinutesPerRequest.toFixed(1)} min</strong> per request instead of <strong>{a.manualMinutes} min</strong>.
            At {a.requestsPerDay} requests a day that frees about <strong>{hours(v.monthlyHours)}</strong> a month, worth roughly <strong>{money(v.monthlyCost)}</strong>.
          </p>
          <p className="hint">So far this run: {v.completed} requests, {v.touches} times you stepped in, {hours(v.savedHoursRun)} saved.</p>
        </>
      ) : (
        <p className="empty">Complete a request to see the estimate.</p>
      )}
      <details className="assumptions">
        <summary>Assumptions{changed && ' (changed)'}</summary>
        <div className="fields">
          {FIELDS.map((f) => (
            <label key={f.key}>
              <span>{f.label}</span>
              <span className="field">
                {f.unit === '$' && <i>$</i>}
                <input
                  type="number"
                  inputMode="numeric"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={a[f.key]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) actions.setValue({ [f.key]: Math.min(f.max, Math.max(f.min, n)) });
                  }}
                />
                {f.unit && f.unit !== '$' && <i>{f.unit}</i>}
              </span>
            </label>
          ))}
        </div>
        {changed && <button className="text-btn" onClick={actions.resetValue}>Restore defaults</button>}
      </details>
      <p className="footnote">An estimate from these assumptions and this run's mix of requests, not a measurement. Model costs are not included; they are a fraction of a cent per request with Claude Haiku 5.5.</p>
    </section>
  );
}

export function Dashboard() {
  const s = useSim();
  const select = useUI((st) => st.select);
  const [table, setTable] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const m = computeMetrics(s);
  const maxQ = Math.max(1, ...m.agents.map((a) => a.queued));

  return (
    <div className="dash">
      <section className="insight" aria-live="polite">
        <h2>What to act on</h2>
        <p>{m.insight}</p>
      </section>

      <section className="tiles">
        <Tile label="Completed" value={String(m.completed)} sub={m.open ? `${m.open} still open` : undefined} />
        <Tile label="Average time to close" value={m.completed ? secs(m.avgCycle) : 'n/a'} />
        <Tile label="Closed without you" value={m.completed ? pct(m.autonomy) : 'n/a'} sub="No approval or other action needed" />
        <Tile label="Sent back for changes" value={m.reworkRate ? pct(m.reworkRate) : '0%'} sub="Of requests that reached review" />
        <Tile label="Met response target" value={m.completed ? pct(m.slaMet) : 'n/a'} sub={m.slaAlerts.length ? `${m.slaAlerts.length} open ${m.slaAlerts.length === 1 ? 'request' : 'requests'} at risk or late` : 'Nothing open is at risk'} />
      </section>

      <ValuePanel />

      <section>
        <div className="row between">
          <h2>Where the time goes</h2>
          <button className="text-btn" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'Show chart' : 'Show table'}</button>
        </div>
        <p className="hint">Average per request at each step.</p>
        {table ? (
          <table className="data">
            <thead><tr><th>Step</th><th>Waiting</th><th>Working</th><th>Requests</th></tr></thead>
            <tbody>
              {m.stages.map((st) => (
                <tr key={st.stage}><th scope="row">{st.label}</th><td>{st.samples ? secs(st.wait) : 'n/a'}</td><td>{st.samples && st.stage !== 'approval' ? secs(st.work) : 'n/a'}</td><td>{st.samples}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <div className="legend" aria-hidden="true">
              <span><i className="sw sw-wait" />Waiting to start</span>
              <span><i className="sw sw-work" />Being worked on</span>
            </div>
            <StageChart stages={m.stages} onTip={setTip} />
          </>
        )}
      </section>

      <section>
        <h2>Right now</h2>
        <table className="data agents-now">
          <thead><tr><th>Agent</th><th>In tray</th><th>Busy</th></tr></thead>
          <tbody>
            {m.agents.map((a) => (
              <tr key={a.id}>
                <th scope="row">
                  <button className="agent-link" onClick={() => select({ kind: 'agent', id: a.id })}>
                    <i style={{ background: AGENTS[a.id].color }} />{a.name}
                  </button>
                </th>
                <td>
                  <span className="mini">
                    <span className="mini-bar" style={{ width: `${(a.queued / maxQ) * 100}%` }} />
                    <span className="mini-val">{a.queued}</span>
                  </span>
                </td>
                <td>{m.created ? pct(a.utilisation) : 'n/a'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Busy is the share of time spent working or carrying since the first request arrived.</p>
      </section>

      <section>
        <h2>Your oversight</h2>
        <dl className="oversight">
          <div><dt>Waiting for you</dt><dd className={m.human.waiting ? 'alert' : ''}>{m.human.waiting}</dd></div>
          <div><dt>Approved</dt><dd>{m.human.approvals}</dd></div>
          <div><dt>Sent back</dt><dd>{m.human.changes}</dd></div>
          <div><dt>Held</dt><dd>{m.human.holds}</dd></div>
          <div><dt>Reassigned</dt><dd>{m.human.reassigns}</dd></div>
          <div><dt>Cancelled</dt><dd>{m.human.cancels}</dd></div>
        </dl>
      </section>

      <section>
        <h2>Export</h2>
        <button className="btn ghost" disabled={!m.created} onClick={() => download(`atrium-requests-${stamp()}.csv`, allRequestsCsv(sim.state), 'text/csv')}>Download all requests (CSV)</button>
      </section>

      <p className="footnote">Times are simulated seconds. A real desk would measure minutes or hours, but the shape of the problem is the same.</p>
      {tip && <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
    </div>
  );
}
