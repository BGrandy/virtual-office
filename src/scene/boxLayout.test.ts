import { describe, expect, it } from 'vitest';
import { Simulation } from '../sim/engine';
import { BOX_H, PILE_HEIGHT, SHELF_SLOTS, computeBoxLayout } from './boxLayout';

// The floor slab: 25 x 22 centred on (0, -3.2).
const onFloor = (x: number, z: number) => Math.abs(x) < 12.3 && z > -14 && z < 7.6;

function key(x: number, y: number, z: number) {
  return `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
}

describe('box layout', () => {
  it('keeps any number of waiting boxes on the floor, then grows the piles upward', () => {
    const sim = new Simulation();
    for (let i = 0; i < 260; i++) sim.createTask('lockout');
    const l = computeBoxLayout(sim);
    const seen = new Set<string>();
    let tallest = 0;
    for (const t of sim.state.tasks.filter((x) => x.status === 'queued')) {
      const p = l.spots.get(t.id)!;
      expect(onFloor(p.x, p.z)).toBe(true);
      tallest = Math.max(tallest, p.y);
      seen.add(key(Math.round(p.x * 4) / 4, p.y, Math.round(p.z * 4) / 4));
    }
    expect(seen.size).toBe(260);
    expect(tallest).toBeGreaterThan(BOX_H * PILE_HEIGHT); // overflow went up, not into a wall
  });

  it('stacks waiting work in piles of six behind the desk, and every box has its own spot', () => {
    const sim = new Simulation();
    for (let i = 0; i < 40; i++) sim.createTask('lockout');
    const l = computeBoxLayout(sim);
    const queued = sim.state.tasks.filter((t) => t.status === 'queued');
    expect(queued).toHaveLength(40);
    const seen = new Set<string>();
    for (const t of queued) {
      const p = l.spots.get(t.id)!;
      expect(p.y).toBeLessThanOrEqual(BOX_H / 2 + (PILE_HEIGHT - 1) * BOX_H + 1e-9);
      expect(onFloor(p.x, p.z)).toBe(true);
      // rounded, so jitter does not hide two boxes in the same place
      seen.add(key(Math.round(p.x * 2) / 2, p.y, Math.round(p.z * 2) / 2));
    }
    expect(seen.size).toBe(40);
  });

  it('puts the next box to be picked up on top of the first pile', () => {
    const sim = new Simulation();
    sim.createTask('lockout');
    const second = sim.createTask('lockout');
    const third = sim.createTask('lockout');
    sim.step(0.1); // Iris picks up the first
    const l = computeBoxLayout(sim);
    expect(l.spots.get(second.id)!.y).toBeLessThan(l.spots.get(third.id)!.y);
  });

  it('fills the shelf, then packs each full shelf into a crate', () => {
    const sim = new Simulation();
    const make = (n: number) => {
      for (let i = 0; i < n; i++) {
        const t = sim.createTask('lockout');
        t.status = 'done';
        t.completedAt = sim.state.time + i;
      }
      sim.state.time += n;
    };
    make(12);
    let l = computeBoxLayout(sim);
    expect(l.crates).toHaveLength(0);
    expect([...l.spots.values()].filter((s) => !s.packed)).toHaveLength(SHELF_SLOTS);

    make(1); // the 13th
    l = computeBoxLayout(sim);
    expect(l.crates).toHaveLength(1);
    expect([...l.spots.values()].filter((s) => s.packed)).toHaveLength(12);
    expect([...l.spots.values()].filter((s) => !s.packed)).toHaveLength(1);

    make(150);
    l = computeBoxLayout(sim);
    expect(l.completed).toBe(163);
    expect(l.crates).toHaveLength(13);
    const shelfBoxes = [...l.spots.values()].filter((s) => !s.packed);
    expect(shelfBoxes.length).toBeGreaterThan(0);
    expect(shelfBoxes.length).toBeLessThanOrEqual(SHELF_SLOTS);
    // crates stack at most three high and stay on the floor
    for (const c of l.crates) {
      expect(c.y).toBeLessThan(2);
      expect(onFloor(c.x, c.z)).toBe(true);
    }
    expect(new Set(l.crates.map((c) => key(c.x, c.y, c.z))).size).toBe(13);
  });

  it('orders the shelf by completion time, not creation time', () => {
    const sim = new Simulation();
    const a = sim.createTask('lockout');
    const b = sim.createTask('lockout');
    Object.assign(b, { status: 'done', completedAt: 5 });
    Object.assign(a, { status: 'done', completedAt: 9 });
    const l = computeBoxLayout(sim);
    const shelf = (id: string) => l.spots.get(id)!;
    // b finished first, so it takes the first slot
    expect(Math.hypot(shelf(b.id).x - shelf(a.id).x, shelf(b.id).z - shelf(a.id).z)).toBeCloseTo(0.48, 2);
  });
});
