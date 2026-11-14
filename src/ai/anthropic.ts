// Calls the Anthropic Messages API directly from the browser with the user's own key.
// There is no Atrium server: the key goes only from this browser to api.anthropic.com.

import type { AIStageResult, Priority, Task, WorkStage } from '../sim/types';
import { buildStageRequest } from './prompts';
import { MAX_OUTPUT_TOKENS } from './budget';

export interface CallUsage { inputTokens: number; outputTokens: number }

export const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest and cheapest. Recommended.' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Stronger reasoning, a little slower.' },
] as const;

export const modelLabel = (id?: string) => MODELS.find((m) => m.id === id)?.label ?? id ?? 'the model';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 45_000;

interface Conn {
  apiKey: string;
  model: string;
}

class APIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function post(conn: Conn, body: Record<string, unknown>) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': conn.apiKey,
        'anthropic-version': '2023-06-01',
        // Opt-in required by the API for calls made straight from a browser.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: conn.model, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new APIError(explain(res.status, data?.error?.message), res.status);
    return data as { content?: { type: string; name?: string; input?: Record<string, unknown>; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  } catch (e) {
    if (e instanceof APIError) throw e;
    if ((e as Error).name === 'AbortError') throw new APIError('the model took too long to answer');
    throw new APIError('could not reach api.anthropic.com (check your connection)');
  } finally {
    clearTimeout(timer);
  }
}

function explain(status: number, msg?: string) {
  if (status === 401) return 'the API key was rejected';
  if (status === 403) return 'this key is not allowed to use that model';
  if (status === 404) return 'that model is not available to this key';
  if (status === 429) return 'rate limit reached, try again shortly';
  if (status === 529 || status >= 500) return 'the API is busy, try again shortly';
  return msg ? `API error ${status}: ${msg}` : `API error ${status}`;
}

const usageOf = (d: { usage?: { input_tokens?: number; output_tokens?: number } }): CallUsage => ({
  inputTokens: d.usage?.input_tokens ?? 0,
  outputTokens: d.usage?.output_tokens ?? 0,
});

/** Cheap call used by "Test and turn on". */
export async function testConnection(conn: Conn): Promise<CallUsage> {
  return usageOf(await post(conn, { max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] }));
}

/** Run one agent's stage and convert the tool call into the shape the engine expects. */
export async function runStage(conn: Conn, task: Task, stage: WorkStage, onUsage?: (u: CallUsage) => void): Promise<AIStageResult> {
  const req = buildStageRequest(task, stage);
  const base = { max_tokens: MAX_OUTPUT_TOKENS, system: req.system, tools: [req.tool], messages: [{ role: 'user', content: req.user }] };
  let data;
  try {
    data = await post(conn, { ...base, tool_choice: { type: 'tool', name: req.tool.name } });
  } catch (e) {
    // Some configurations refuse a forced tool choice; retry once letting the model choose.
    if (e instanceof APIError && e.status === 400) data = await post(conn, { ...base, tool_choice: { type: 'auto' } });
    else throw e;
  }
  // Count what was actually used, even if the answer turns out to be malformed.
  onUsage?.(usageOf(data));
  return parseStage(data, stage, conn.model);
}

/** Validates the model's answer. Anything malformed becomes an error, and the engine falls back to the script. */
export function parseStage(data: { content?: { type: string; input?: Record<string, unknown>; text?: string }[] }, stage: WorkStage, model: string): AIStageResult {
  const call = data.content?.find((c) => c.type === 'tool_use');
  let input = call?.input;
  if (!input) {
    // Fallback: a JSON object in plain text.
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (m) try { input = JSON.parse(m[0]); } catch { /* handled below */ }
  }
  if (!input || typeof input.body !== 'string' || !input.body.trim()) throw new APIError('the model returned an answer in the wrong shape');

  const steps = (Array.isArray(input.steps) ? input.steps : [])
    .filter((x): x is string => typeof x === 'string' && !!x.trim())
    .map((x) => x.trim().replace(/[.…]+$/, '').slice(0, 60))
    .slice(0, 4);
  const r: AIStageResult = { status: 'done', steps: steps.length ? steps : ['Working on it'], body: input.body.trim().slice(0, 1500), model: modelLabel(model) };

  if (stage === 'triage' && ['P1', 'P2', 'P3'].includes(input.priority as string)) r.priority = input.priority as Priority;
  if (stage === 'planning') {
    r.risky = input.risky === true;
    if (r.risky && typeof input.risk_reason === 'string') r.riskReason = input.risk_reason.trim().slice(0, 140);
  }
  if (stage === 'review') {
    const v = input.verdict;
    r.verdict = v === 'changes' || v === 'escalate' ? v : 'pass';
  }
  return r;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'unknown error');
