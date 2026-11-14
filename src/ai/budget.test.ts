import { describe, expect, it } from 'vitest';
import { EMPTY_USAGE, addUsage, callsLeft, canAfford, costOf, worstCaseCall } from './budget';

describe('spending guard', () => {
  it('prices calls from published per-million-token rates', () => {
    expect(costOf('claude-haiku-5-5', 1_000_000, 0)).toBeCloseTo(0.1);
    expect(costOf('claude-haiku-5-5', 0, 1_000_000)).toBeCloseTo(0.5);
    expect(costOf('claude-sonnet-5-5', 1_000_000, 1_000_000)).toBeCloseTo(12);
    // an unknown model is priced at the most expensive tier, never as free
    expect(costOf('mystery-model', 1_000_000, 0)).toBeGreaterThanOrEqual(10);
  });

  it('adds up real usage', () => {
    const u = addUsage(addUsage(EMPTY_USAGE, 'claude-haiku-5-5', 2000, 400), 'claude-haiku-5-5', 1000, 100);
    expect(u).toMatchObject({ calls: 2, inputTokens: 3000, outputTokens: 500 });
    expect(u.cost).toBeCloseTo((3000 * 0.1 + 500 * 0.5) / 1e6);
  });

  it('refuses a call that could cross the limit, even in the worst case', () => {
    const limit = 0.1;
    const worst = worstCaseCall('claude-haiku-5-5');
    expect(canAfford({ ...EMPTY_USAGE, cost: limit - worst }, 'claude-haiku-5-5', limit)).toBe(true);
    expect(canAfford({ ...EMPTY_USAGE, cost: limit - worst + 1e-6 }, 'claude-haiku-5-5', limit)).toBe(false);
    expect(canAfford({ ...EMPTY_USAGE, cost: limit }, 'claude-haiku-5-5', limit)).toBe(false);
  });

  it('can never overspend, however many calls are attempted', () => {
    let u = EMPTY_USAGE;
    const limit = 0.25;
    for (let i = 0; i < 10_000 && canAfford(u, 'claude-sonnet-5-5', limit); i++) u = addUsage(u, 'claude-sonnet-5-5', 4000, 900);
    expect(u.cost).toBeLessThanOrEqual(limit);
    expect(callsLeft(u, 'claude-sonnet-5-5', limit)).toBe(0);
  });

  it('gives a realistic sense of scale for the default limit', () => {
    // A worst-case Haiku call is well under a tenth of a cent, so $0.25 covers hundreds of calls.
    expect(worstCaseCall('claude-haiku-5-5')).toBeLessThan(0.001);
    expect(callsLeft(EMPTY_USAGE, 'claude-haiku-5-5', 0.25)).toBeGreaterThan(250);
    // Sonnet is about 20 times the price: the same limit covers about 15 calls.
    expect(callsLeft(EMPTY_USAGE, 'claude-sonnet-5-5', 0.25)).toBeLessThan(20);
  });
});
