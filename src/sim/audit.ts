// Audit export: everything recorded about a request, as JSON or CSV.
// Times are simulated seconds since the demo started (the "sim_time" columns).

import { PRIORITY_NAME, SLA_REAL, STAGE_META, actorName } from './data';
import { slaInfo } from './sla';
import type { SimState, Task } from './types';

const who = (a: string) => (a === 'human' ? 'Supervisor' : actorName(a));

export function taskAudit(s: SimState, t: Task, exportedAt: string) {
  const sla = slaInfo(t, s.time);
  return {
    exported_at: exportedAt,
    note: 'Atrium demo export. Agent work is scripted unless "mode" is "ai"; no real IT systems were changed.',
    request: {
      id: t.id,
      title: t.title,
      requester: t.requester,
      priority: `${t.priority} (${PRIORITY_NAME[t.priority]})`,
      mode: t.mode === 'ai' ? 'ai' : 'scripted',
      status: t.status,
      created_sim_time: round(t.createdAt),
      completed_sim_time: t.completedAt === undefined ? null : round(t.completedAt),
      response_target: SLA_REAL[t.priority],
      response_target_result: sla?.state ?? 'not applicable',
      rework_rounds: t.rework,
      approval_reason: t.riskReason ?? null,
    },
    stages: t.timeline.map((sp) => ({
      stage: STAGE_META[sp.stage].label,
      owner: who(sp.owner),
      arrived: round(sp.arrived),
      started: sp.started === undefined ? null : round(sp.started),
      finished: sp.finished === undefined ? null : round(sp.finished),
    })),
    handoffs: t.history.map((h) => ({ sim_time: round(h.t), kind: h.kind, from: who(h.from), to: who(h.to), from_stage: STAGE_META[h.fromStage].label, to_stage: STAGE_META[h.toStage].label, note: h.note ?? null })),
    consults: (t.consults ?? []).map((c) => ({ sim_time: round(c.t), stage: STAGE_META[c.stage].label, asked_by: who(c.from), asked: who(c.to), question: c.question, answer: c.answer })),
    outputs: t.outputs.map((o) => ({ sim_time: round(o.t), stage: STAGE_META[o.stage].label, by: who(o.by), written_by: o.source === 'ai' ? o.model ?? 'model' : o.source ?? 'script', title: o.title, body: o.body, result: o.kind ?? 'ok' })),
    events: s.events.filter((e) => e.taskId === t.id).map((e) => ({ sim_time: round(e.t), type: e.type, actor: e.actor ? who(e.actor) : null, text: e.text })),
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** RFC 4180 CSV with every cell quoted, plus a guard against spreadsheet formula injection. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function taskEventsCsv(s: SimState, t: Task) {
  return toCsv([
    ['sim_time', 'request', 'type', 'actor', 'text'],
    ...s.events.filter((e) => e.taskId === t.id).map((e) => [round(e.t), t.id, e.type, e.actor ? who(e.actor) : '', e.text]),
  ]);
}

export function allRequestsCsv(s: SimState) {
  return toCsv([
    ['request', 'title', 'requester', 'priority', 'mode', 'status', 'created_sim_time', 'completed_sim_time', 'cycle_seconds', 'response_target', 'target_result', 'rework_rounds', 'human_actions', 'approval_reason'],
    ...s.tasks.map((t) => {
      const sla = slaInfo(t, s.time);
      const human = s.events.filter((e) => e.taskId === t.id && e.actor === 'human').length;
      return [
        t.id, t.title, t.requester, t.priority, t.mode === 'ai' ? 'ai' : 'scripted', t.status, round(t.createdAt),
        t.completedAt === undefined ? '' : round(t.completedAt), t.completedAt === undefined ? '' : round(t.completedAt - t.createdAt),
        SLA_REAL[t.priority], sla?.state ?? '', t.rework, human, t.riskReason ?? '',
      ];
    }),
  ]);
}
