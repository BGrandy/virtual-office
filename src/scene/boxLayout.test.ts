import { describe, expect, it } from 'vitest';
import { Simulation } from '../sim/engine';
import { BOX_H, PYRAMID_CELL, TOWER_VISIBLE, computeBoxLayout, pyramidCapacity, pyramidCell, pyramidSize, towerLean } from './boxLayout';

const key = (x: number, y: number, z: number) => `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;

function finish(sim: Simulation, n: number) {
  for (let i = 0; i < n; i++) {
    const t = sim.createTask('lockout');
    Object.assign(t, { status: 'done', stage: 'done', ownerId: 'echo', completedAt: sim.state.time + i });
  }
  sim.state.time += n;
}

describe('desk towers', () => {
  it('stacks waiting work on the desk, next-up at the bottom', () => {
    const sim = new Simulation();
    sim.createTask('lockout');
    const second = sim.createTask('lockout');
    const third = sim.createTask('lockout');
    sim.step(0.1); // Iris picks up the first
    const l = computeBoxLayout(sim);
    expect(l.spots.get(second.id)!.y).toBeLessThan(l.spots.get(third.id)!.y);
    expect(l.spots.get(second.id)!.y).toBeCloseTo(0.9 + BOX_H / 2);
    expect(l.towers.iris.count).toBe(2);
  });

  it('shows ten boxes and counts the rest', () => {
    const sim = new Simulation();
    for (let i = 0; i < 40; i++) sim.createTask('lockout');
    const l = computeBoxLayout(sim);
    const queued = sim.state.tasks.filter((t) => t.status === 'queued');
    const visible = queued.filter((t) => !l.spots.get(t.id)!.hidden);
    expect(visible).toHaveLength(TOWER_VISIBLE);
    expect(new Set(visible.map((t) => l.spots.get(t.id)!.y.toFixed(3))).size).toBe(TOWER_VISIBLE);
    expect(l.towers.iris.hiddenCount).toBe(30);
    expect(l.towers.iris.topY).toBeCloseTo(0.9 + TOWER_VISIBLE * BOX_H);
  });

  it('sways more as it grows, and short towers stand still', () => {
    const peak = (n: number) => Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(towerLean('iris', n, i * 0.05))));
    expect(peak(3)).toBe(0);
    expect(peak(6)).toBeGreaterThan(0);
    expect(peak(10)).toBeGreaterThan(peak(6));
    expect(peak(50)).toBeCloseTo(peak(10)); // capped at the visible height
  });
});

describe('pyramid', () => {
  it('has the right capacity and base size', () => {
    expect([1, 2, 3, 4].map(pyramidCapacity)).toEqual([1, 5, 14, 30]);
    expect(pyramidSize(0)).toBe(0);
    expect(pyramidSize(1)).toBe(1);
    expect(pyramidSize(5)).toBe(2);
    expect(pyramidSize(6)).toBe(3);
    expect(pyramidSize(500)).toBe(11);
  });

  it('never leaves a box floating: each one above the base rests on four below', () => {
    for (const n of [1, 7, 14, 23, 30, 31, 91, 205]) {
      const size = pyramidSize(n);
      const cells = Array.from({ length: n }, (_, i) => pyramidCell(i, size));
      const filled = new Set(cells.map((c) => key(c.x, c.layer, c.z)));
      expect(filled.size).toBe(n);
      for (const c of cells) {
        if (c.layer === 0) continue;
        const h = PYRAMID_CELL / 2;
        for (const [dx, dz] of [[-h, -h], [-h, h], [h, -h], [h, h]]) {
          expect(filled.has(key(c.x + dx, c.layer - 1, c.z + dz))).toBe(true);
        }
      }
    }
  });

  it('stays a sensible size even after hundreds of requests', () => {
    const sim = new Simulation();
    finish(sim, 500);
    const l = computeBoxLayout(sim);
    expect(l.pyramid.count).toBe(500);
    expect(l.pyramid.height).toBeLessThan(3.2);
    for (const t of sim.state.tasks) {
      const p = l.spots.get(t.id)!;
      expect(Math.hypot(p.x, p.z + 0.4)).toBeLessThan(3.6); // within the rug's reach
    }
  });

  it('orders the pyramid by completion time, not creation time', () => {
    const sim = new Simulation();
    const a = sim.createTask('lockout');
    const b = sim.createTask('lockout');
    Object.assign(b, { status: 'done', completedAt: 5 });
    Object.assign(a, { status: 'done', completedAt: 9 });
    const l = computeBoxLayout(sim);
    // size 2 base, b first so it takes the back-left cell
    expect(l.spots.get(b.id)!.z).toBeLessThan(l.spots.get(a.id)!.z + 1e-9);
    expect(l.spots.get(b.id)!.x).toBeLessThan(l.spots.get(a.id)!.x);
  });
});
