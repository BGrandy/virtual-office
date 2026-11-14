// Spending guard for live AI mode. Pure functions, unit-tested.
//
// Every call's real token usage (from the API response) is added up per device,
// priced with the published per-token rates, and checked BEFORE the next call:
// if the next call could take the total past the limit, it is not made.

export interface Usage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated US dollars. */
  cost: number;
}

export const EMPTY_USAGE: Usage = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };

/** US dollars per million tokens (prompts under 100K tokens), from Anthropic's published pricing. */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};
const FALLBACK_PRICE = { input: 10, output: 50 }; // unknown model: assume the most expensive tier

export const LIMIT_OPTIONS = [0.1, 0.25, 1] as const;
export const DEFAULT_LIMIT = 0.25;
/** At most this many model calls run at the same time. */
export const MAX_CONCURRENT = 3;

/** Largest prompt one stage can send (system + request + five capped outputs), and the output cap. */
const WORST_INPUT_TOKENS = 4000;
export const MAX_OUTPUT_TOKENS = 900;

const price = (model: string) => PRICES[model] ?? FALLBACK_PRICE;

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const p = price(model);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** The most one stage call could possibly cost. */
export const worstCaseCall = (model: string) => costOf(model, WORST_INPUT_TOKENS, MAX_OUTPUT_TOKENS);

export function addUsage(u: Usage, model: string, inputTokens: number, outputTokens: number): Usage {
  return {
    calls: u.calls + 1,
    inputTokens: u.inputTokens + inputTokens,
    outputTokens: u.outputTokens + outputTokens,
    cost: u.cost + costOf(model, inputTokens, outputTokens),
  };
}

/** True if one more call cannot push spending past the limit, even in the worst case. */
export const canAfford = (u: Usage, model: string, limit: number) => u.cost + worstCaseCall(model) <= limit;

/** Roughly how many more request stages fit under the limit, assuming worst-case calls. */
export const callsLeft = (u: Usage, model: string, limit: number) => Math.max(0, Math.floor((limit - u.cost) / worstCaseCall(model)));

export const dollars = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
