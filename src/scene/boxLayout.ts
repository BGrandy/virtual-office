// Where every request box sits, computed once per frame for the whole office.
// Pure (no three.js), so the rules are unit-tested.
//
// - Waiting work: a tower on the owner's desk. The next request is at the bottom,
//   so taking it makes the tower drop a level, Jenga-style. Taller towers sway more.
//   Ten boxes are shown; the rest are counted in a "+N more" tag on top.
// - Your console: small piles on the console top.
// - Completed: a pyramid in the middle of the room, filled from the bottom up so no
//   box ever floats. When it outgrows its base, it rebuilds one size larger.

import { AGENT_IDS } from '../sim/data';
import type { Simulation } from '../sim/engine';
import { AGENT_STATION, ROOM_CENTRE, station, type Station } from '../sim/layout';
import type { AgentId, Task } from '../sim/types';

export const BOX_H = 0.28;
export const TOWER_VISIBLE = 10;
export const PYRAMID_CELL = 0.44;
const DESK_TOP = 0.9;
const CONSOLE_TOP = 1.05;
const CONSOLE_PILE = 4;

export interface BoxSpot {
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Not shown: above the visible part of a tower. Shrinks out of sight. */
  hidden?: boolean;
  /** Held by a walking agent: follow tightly. */
  carried?: boolean;
  /** Being worked on at the desk: spin. */
  spinning?: boolean;
  /** Part of a desk tower: sways with it. */
  tower?: { agent: AgentId; level: number };
}

export interface Tower {
  agent: AgentId;
  /** Requests waiting, including those beyond the visible ten. */
  count: number;
  hiddenCount: number;
  x: number;
  z: number;
  /** Top of the visible tower, for the "+N more" tag. */
  topY: number;
  /** Unit vector along the desk, the direction the tower sways in. */
  sway: [number, number];
}

export interface Pyramid {
  count: number;
  /** Base is size x size boxes. */
  size: number;
  height: number;
  /** Top of the pile, for the counter and the celebration burst. */
  top: [number, number, number];
}

export interface BoxLayout {
  spots: Map<string, BoxSpot>;
  towers: Record<AgentId, Tower>;
  pyramid: Pyramid;
  completed: number;
}

/** Stable pseudo-random number in [-1, 1] for a string, so each box keeps its own tilt. */
export function jitter(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

const at = (st: Station, along: number, inward: number): [number, number] => [
  st.center[0] + st.tangent[0] * along + st.inward[0] * inward,
  st.center[1] + st.tangent[1] * along + st.inward[1] * inward,
];

/** In-tray spot on the desk, at the end away from the laptop. */
export const towerBase = (st: Station) => at(st, -0.85, 0);

/**
 * How far a tower of `n` boxes leans right now, in radians. Short towers stand still;
 * tall ones sway further and more slowly. Each agent's tower has its own rhythm.
 */
export function towerLean(agent: string, n: number, t: number): number {
  if (n < 4) return 0;
  const amp = 0.0026 * (Math.min(n, TOWER_VISIBLE) - 3) ** 1.7;
  const speed = 2.3 - 0.09 * Math.min(n, TOWER_VISIBLE);
  return amp * Math.sin(t * speed + (jitter(agent) + 1) * 3);
}

// ---------------------------------------------------------------------- pyramid

/** Boxes in a full pyramid with a base of `m` x `m`: 1 + 4 + 9 + ... + m². */
export const pyramidCapacity = (m: number) => (m * (m + 1) * (2 * m + 1)) / 6;

/** Smallest base that holds `n` boxes. */
export function pyramidSize(n: number): number {
  let m = 0;
  while (pyramidCapacity(m) < n) m++;
  return m;
}

/**
 * Position of the i-th box (0-based) in a pyramid with base `size`, filled from the
 * bottom layer up, back row to front row, so every box above the base rests on four below.
 */
export function pyramidCell(i: number, size: number): { x: number; y: number; z: number; layer: number } {
  let layer = 0;
  let rest = i;
  while (layer < size && rest >= (size - layer) ** 2) {
    rest -= (size - layer) ** 2;
    layer++;
  }
  const s = size - layer;
  const row = Math.floor(rest / s);
  const col = rest % s;
  return {
    layer,
    x: ROOM_CENTRE[0] + (col - (s - 1) / 2) * PYRAMID_CELL,
    y: BOX_H / 2 + layer * BOX_H,
    z: ROOM_CENTRE[1] + (row - (s - 1) / 2) * PYRAMID_CELL,
  };
}

// ----------------------------------------------------------------------- layout

export function computeBoxLayout(sim: Simulation): BoxLayout {
  const s = sim.state;
  const spots = new Map<string, BoxSpot>();
  const towers = {} as Record<AgentId, Tower>;

  // Waiting work: desk towers, next-up at the bottom.
  for (const id of AGENT_IDS) {
    const st = station(AGENT_STATION[id as AgentId]);
    const [bx, bz] = towerBase(st);
    const queue = sim.queueFor(id);
    const shown = Math.min(queue.length, TOWER_VISIBLE);
    const topY = DESK_TOP + shown * BOX_H;
    towers[id] = { agent: id, count: queue.length, hiddenCount: Math.max(0, queue.length - TOWER_VISIBLE), x: bx, z: bz, topY, sway: st.tangent };
    queue.forEach((t, k) => {
      const level = Math.min(k, TOWER_VISIBLE - 1);
      spots.set(t.id, {
        x: bx + jitter(t.id, 1) * 0.02,
        y: DESK_TOP + BOX_H / 2 + level * BOX_H,
        z: bz + jitter(t.id, 2) * 0.02,
        rotY: st.rotY + jitter(t.id) * 0.18,
        tower: { agent: id, level },
        hidden: k >= TOWER_VISIBLE,
      });
    });
  }

  // Being worked on, carried, or at your console.
  const consoleQueue: Task[] = [];
  for (const t of s.tasks) {
    if (t.status === 'active' && t.ownerId !== 'human') {
      const st = station(AGENT_STATION[t.ownerId as AgentId]);
      const [x, z] = at(st, 0, 0.05);
      spots.set(t.id, { x, y: DESK_TOP + 0.36, z, rotY: st.rotY, spinning: true });
    } else if (t.status === 'handoff') {
      const carrier = Object.values(s.agents).find((a) => a.taskId === t.id);
      if (carrier) {
        spots.set(t.id, { x: carrier.pos[0] + Math.sin(carrier.heading) * 0.5, y: 0.95, z: carrier.pos[1] + Math.cos(carrier.heading) * 0.5, rotY: carrier.heading, carried: true });
      }
    } else if (t.status === 'awaiting-approval') consoleQueue.push(t);
  }
  const consoleSt = station('approval');
  consoleQueue.forEach((t, i) => {
    const p = Math.floor(i / CONSOLE_PILE);
    const [x, z] = at(consoleSt, ((p % 3) - 1) * 0.5, 0.15 - 0.4 * Math.floor(p / 3));
    spots.set(t.id, { x, y: CONSOLE_TOP + BOX_H / 2 + (i % CONSOLE_PILE) * BOX_H, z, rotY: consoleSt.rotY + jitter(t.id) * 0.25 });
  });

  // Completed: the pyramid, in the order requests finished.
  const done = s.tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0) || a.createdAt - b.createdAt);
  const size = pyramidSize(done.length);
  let height = 0;
  done.forEach((t, i) => {
    const c = pyramidCell(i, size);
    height = Math.max(height, (c.layer + 1) * BOX_H);
    spots.set(t.id, { x: c.x, y: c.y, z: c.z, rotY: jitter(t.id) * 0.05 });
  });

  return {
    spots,
    towers,
    pyramid: { count: done.length, size, height, top: [ROOM_CENTRE[0], height, ROOM_CENTRE[1]] },
    completed: done.length,
  };
}

// One layout per frame, shared by every box, the labels, effects and the camera.
let cacheKey = '';
let cache: BoxLayout | null = null;
export function boxLayout(sim: Simulation): BoxLayout {
  const s = sim.state;
  const key = `${s.time}|${s.seq}|${s.tasks.length}`;
  if (key !== cacheKey || !cache) {
    cache = computeBoxLayout(sim);
    cacheKey = key;
  }
  return cache;
}
