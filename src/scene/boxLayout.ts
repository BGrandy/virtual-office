// Where every request box sits, computed once per frame for the whole office.
// Pure (no three.js), so the rules are unit-tested: piles never grow taller than
// PILE_HEIGHT, no two boxes share a spot, and nothing leaves the floor no matter
// how many requests there are.
//
// - Waiting work: piles on the floor behind the owner, slightly askew like stacks
//   of books. Four piles of six per row, up to four rows; after that the piles
//   keep growing upward, so there is no limit and nothing walks into a wall.
// - Your console: small piles on the console top.
// - Completed: the shelf holds the latest 12. When the 13th arrives, the full shelf
//   is packed into an archive crate, and crates stack three high on pallets behind it.

import { AGENT_IDS } from '../sim/data';
import type { Simulation } from '../sim/engine';
import { AGENT_STATION, station, type Station } from '../sim/layout';
import type { AgentId, Task } from '../sim/types';

export const BOX_H = 0.28;
export const PILE_HEIGHT = 6;
export const SHELF_SLOTS = 12;
export const CRATE_CAPACITY = 12;
export const CRATES_PER_PALLET = 3;
export const CRATE_H = 0.6;
const DESK_TOP = 0.9;
const CONSOLE_TOP = 1.05;
const CONSOLE_PILE = 4;

export interface BoxSpot {
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Packed away in an archive crate: the box flies in and shrinks out of sight. */
  packed?: boolean;
  /** Held by a walking agent: follow tightly. */
  carried?: boolean;
  /** Being worked on at the desk: spin. */
  spinning?: boolean;
}

export interface CrateSpot {
  index: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  count: number;
}

export interface BoxLayout {
  spots: Map<string, BoxSpot>;
  crates: CrateSpot[];
  completed: number;
  /** Top of the shelf, for the completed counter. */
  shelfTop: [number, number, number];
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

export const PILES_PER_ROW = 4;
export const PILE_ROWS = 4;
const FLOOR_PILES = PILES_PER_ROW * PILE_ROWS;

/** Floor spot for pile `p` behind a desk: a row of four behind the agent, then rows further back. */
export function pileBase(st: Station, p: number): [number, number] {
  return at(st, -0.825 + 0.55 * (p % PILES_PER_ROW), -(2.0 + 0.55 * Math.floor(p / PILES_PER_ROW)));
}

/** Pile and height for the k-th waiting box. Past the floor space, piles grow taller in turn. */
export function pileSlot(k: number): { pile: number; level: number } {
  const floorBoxes = FLOOR_PILES * PILE_HEIGHT;
  if (k < floorBoxes) return { pile: Math.floor(k / PILE_HEIGHT), level: k % PILE_HEIGHT };
  const extra = k - floorBoxes;
  return { pile: extra % FLOOR_PILES, level: PILE_HEIGHT + Math.floor(extra / FLOOR_PILES) };
}

export function crateSpot(index: number): Omit<CrateSpot, 'count'> {
  const st = station('archive');
  const pallet = Math.floor(index / CRATES_PER_PALLET);
  const level = index % CRATES_PER_PALLET;
  // Two pallets side by side to the right of the shelf, then rows further back.
  const [x, z] = at(st, 1.85 + 1.2 * (pallet % 2), 0.1 - 1.2 * Math.floor(pallet / 2));
  return { index, x, y: 0.12 + CRATE_H / 2 + level * CRATE_H, z, rotY: st.rotY + jitter(`crate${index}`) * 0.08 };
}

export function computeBoxLayout(sim: Simulation): BoxLayout {
  const s = sim.state;
  const spots = new Map<string, BoxSpot>();

  // Waiting work, pile by pile, in the order the agent will take it (top of the first pile is next).
  for (const id of AGENT_IDS) {
    const st = station(AGENT_STATION[id as AgentId]);
    sim.queueFor(id).forEach((t, k) => {
      const { pile, level } = pileSlot(k);
      const [x, z] = pileBase(st, pile);
      spots.set(t.id, {
        x: x + jitter(t.id, 1) * 0.025,
        y: BOX_H / 2 + level * BOX_H,
        z: z + jitter(t.id, 2) * 0.025,
        rotY: st.rotY + jitter(t.id) * 0.22,
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

  // Completed, in the order they finished.
  const done = s.tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0) || a.createdAt - b.createdAt);
  const packedBatches = done.length > SHELF_SLOTS ? Math.floor((done.length - 1) / CRATE_CAPACITY) : 0;
  const crates: CrateSpot[] = [];
  for (let c = 0; c < packedBatches; c++) crates.push({ ...crateSpot(c), count: CRATE_CAPACITY });
  const shelf = station('archive');
  done.forEach((t, i) => {
    const batch = Math.floor(i / CRATE_CAPACITY);
    if (batch < packedBatches) {
      const c = crates[batch];
      spots.set(t.id, { x: c.x, y: c.y + 0.1, z: c.z, rotY: c.rotY, packed: true });
      return;
    }
    const j = i - packedBatches * CRATE_CAPACITY;
    const [x, z] = at(shelf, -0.72 + (j % 4) * 0.48, 0);
    spots.set(t.id, { x, y: 0.37 + Math.floor(j / 4) * 0.56, z, rotY: shelf.rotY });
  });

  const [sx, sz] = at(shelf, 0, 0);
  return { spots, crates, completed: done.length, shelfTop: [sx, 2.35, sz] };
}

// One layout per frame, shared by every box, the crates, labels and the camera.
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
