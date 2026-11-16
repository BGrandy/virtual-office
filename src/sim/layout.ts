// Floor plan. Eight stations sit on a horseshoe that opens toward the camera,
// in workflow order, so a task visibly travels left-to-right around the room.
// The engine uses these points for walking paths; the scene uses them to place furniture.

import type { AgentId, Vec2 } from './types';

export const STATION_KEYS = ['inbox', 'triage', 'planning', 'execution', 'review', 'approval', 'delivery', 'archive'] as const;
export type StationKey = (typeof STATION_KEYS)[number];

export interface Station {
  key: StationKey;
  index: number;
  center: Vec2;
  /** Unit vector pointing at the middle of the room. */
  inward: Vec2;
  /** Unit vector along the horseshoe toward the next station. */
  tangent: Vec2;
  /** Where the resident agent stands (behind the desk, facing the room). */
  home: Vec2;
  /** Side gap used to step out from behind the desk. */
  exit: Vec2;
  /** Point inside the open floor, level with the exit. */
  gate: Vec2;
  /** Where a visiting agent stands to drop off a task. */
  visitor: Vec2;
  /** Y rotation that makes local +Z face the room. */
  rotY: number;
}

const RX = 7.3;
const RZ = 8.3;
const START = 207;
const SWEEP = 234;

const add = (a: Vec2, b: Vec2, s = 1): Vec2 => [a[0] + b[0] * s, a[1] + b[1] * s];
const norm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

function build(): Station[] {
  const centers: Vec2[] = STATION_KEYS.map((_, i) => {
    const th = ((START - (i * SWEEP) / (STATION_KEYS.length - 1)) * Math.PI) / 180;
    return [RX * Math.cos(th), -RZ * Math.sin(th)];
  });
  return STATION_KEYS.map((key, i) => {
    const center = centers[i];
    const inward = norm([-center[0], -center[1]]);
    let tangent: Vec2 = [-inward[1], inward[0]];
    const ref = i < centers.length - 1 ? add(centers[i + 1], center, -1) : add(center, centers[i - 1], -1);
    if (tangent[0] * ref[0] + tangent[1] * ref[1] < 0) tangent = [-tangent[0], -tangent[1]];
    const exit = add(add(center, tangent, 2.0), inward, -0.25);
    return {
      key,
      index: i,
      center,
      inward,
      tangent,
      home: add(center, inward, -1.2),
      exit,
      gate: add(add(center, tangent, 2.0), inward, 2.3),
      visitor: add(center, inward, 1.9),
      rotY: Math.atan2(inward[0], inward[1]),
    };
  });
}

/** The middle of the room, where completed work builds a pyramid. */
export const ROOM_CENTRE: Vec2 = [0, -0.4];
/** Where Echo stands to add a box to the pyramid: this far from the centre, on Echo's side. */
const PYRAMID_REACH = 3.0;

/**
 * The inbox has nobody standing behind it, so it faces the default camera
 * instead of the middle of the room. That way you can see requests arrive.
 */
const VIEWER: Vec2 = [0, 19];
function faceViewer(st: Station): Station {
  const inward = norm([VIEWER[0] - st.center[0], VIEWER[1] - st.center[1]]);
  const tangent: Vec2 = [inward[1], -inward[0]]; // viewer's right-hand side
  return { ...st, inward, tangent, visitor: add(st.center, inward, 1.6), rotY: Math.atan2(inward[0], inward[1]) };
}

/** "Completed" is the pyramid in the middle of the room, facing the viewer. */
function centreStation(st: Station, deliveredBy: Station): Station {
  const toEcho = norm([deliveredBy.center[0] - ROOM_CENTRE[0], deliveredBy.center[1] - ROOM_CENTRE[1]]);
  const visitor = add(ROOM_CENTRE, toEcho, PYRAMID_REACH);
  return { ...st, center: ROOM_CENTRE, inward: [0, 1], tangent: [1, 0], home: ROOM_CENTRE, exit: visitor, gate: visitor, visitor, rotY: 0 };
}

const built = build();
export const STATIONS: Station[] = built.map((st) =>
  st.key === 'inbox' ? faceViewer(st) : st.key === 'archive' ? centreStation(st, built[STATION_KEYS.indexOf('delivery')]) : st,
);
export const station = (key: StationKey): Station => STATIONS[STATION_KEYS.indexOf(key)];

export const AGENT_STATION: Record<AgentId, StationKey> = {
  iris: 'triage',
  atlas: 'planning',
  bolt: 'execution',
  sage: 'review',
  echo: 'delivery',
};

export const headingOf = (v: Vec2) => Math.atan2(v[0], v[1]);
