// Projects each registered 3D anchor to the screen and moves its DOM label there.
// Runs once per frame, after the camera has moved.

import { Vector3, type Camera, type Object3D } from 'three';
import { anchors, elements, type Anchor } from '../state/labelRegistry';

export { anchorRef } from '../state/labelRegistry';

const v = new Vector3();
const projected = new Map<string, { x: number; y: number }>();
/** Smoothed upward lift per label, in pixels. */
const lift = new Map<string, number>();
const AGENTS = ['iris', 'atlas', 'bolt', 'sage', 'echo'];
/** How close two labels' centres can be sideways before they count as sharing a column. */
const NEAR_X = 95;

function shown(o: Anchor | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function syncLabels(camera: Camera, width: number, height: number) {
  camera.updateMatrixWorld();
  projected.clear();
  for (const [key, el] of elements) {
    const o = anchors.get(key) as unknown as Object3D | undefined;
    if (!o || !shown(o as unknown as Anchor)) {
      el.style.display = 'none';
      continue;
    }
    o.getWorldPosition(v).project(camera);
    if (v.z > 1 || v.z < -1) {
      el.style.display = 'none';
      continue;
    }
    el.style.display = '';
    const x = ((v.x + 1) / 2) * width;
    const y = ((1 - v.y) / 2) * height;
    projected.set(key, { x, y });
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    el.style.zIndex = String(Math.round((1 - v.z) * 5000)); // nearer labels sit on top
  }
  // Labels that would sit on top of each other are lifted straight up, never sideways,
  // so a name tag always stays in line with its own robot.
  // Every label is anchored at its bottom centre, so "y" is its bottom edge.
  const settle = (key: string, want: number): number => {
    const cur = lift.get(key) ?? 0;
    const next = Math.abs(want - cur) < 0.3 ? want : cur + (want - cur) * 0.3;
    lift.set(key, next);
    const at = projected.get(key);
    const el = elements.get(key);
    if (at && el && next !== 0) el.style.transform = `translate3d(${at.x.toFixed(1)}px,${(at.y - next).toFixed(1)}px,0)`;
    return next;
  };
  for (const id of AGENTS) {
    // 1. The "N waiting" tag clears any request chip at the same desk.
    const towerKey = `tower:${id}`;
    const tower = projected.get(towerKey);
    let towerY: number | null = null;
    if (tower) {
      let want = 0;
      for (const [key, c] of projected) {
        if (!key.startsWith('task:') || Math.abs(c.x - tower.x) > 90) continue;
        // chip spans [c.y - 18, c.y]; tower tag spans [tower.y - 20, tower.y]
        if (tower.y > c.y - 23 && tower.y - 20 < c.y + 2) want = Math.max(want, tower.y - (c.y - 23));
      }
      towerY = tower.y - settle(towerKey, Math.min(want, 44));
    } else {
      lift.delete(towerKey);
    }
    // 2. The agent's name tag clears the "N waiting" tag.
    const agentKey = `agent:${id}`;
    const agent = projected.get(agentKey);
    if (!agent) {
      lift.delete(agentKey);
      continue;
    }
    let want = 0;
    // name tag spans roughly [agent.y - 44, agent.y]; it moves to sit just above the tower tag
    if (towerY !== null && tower && Math.abs(agent.x - tower.x) < NEAR_X && agent.y > towerY - 24 && agent.y - 44 < towerY + 2) {
      want = agent.y - (towerY - 24);
    }
    settle(agentKey, Math.min(want, 90));
  }
}
