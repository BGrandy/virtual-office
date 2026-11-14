// Projects each registered 3D anchor to the screen and moves its DOM label there.
// Runs once per frame, after the camera has moved.

import { Vector3, type Camera, type Object3D } from 'three';
import { anchors, elements, type Anchor } from '../state/labelRegistry';

export { anchorRef } from '../state/labelRegistry';

const v = new Vector3();
const projected = new Map<string, { x: number; y: number }>();
/** Smoothed sideways nudge per label, in pixels. */
const nudge = new Map<string, number>();
/** Labels that move aside on screen when they would sit on top of another label. */
const AVOID: [string, string][] = ['iris', 'atlas', 'bolt', 'sage', 'echo'].map((id) => [`agent:${id}`, `tower:${id}`]);
const GAP = 100;

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
  // An agent's name tag steps aside on screen so it does not cover its own tower of work.
  for (const [mover, obstacle] of AVOID) {
    const a = projected.get(mover);
    const b = projected.get(obstacle);
    const el = elements.get(mover);
    if (!a || !el) continue;
    let want = 0;
    if (b && Math.abs(a.y - b.y) < 160) {
      const dx = a.x - b.x;
      if (Math.abs(dx) < GAP) want = (dx >= 0 ? 1 : -1) * (GAP - Math.abs(dx));
    }
    const cur = nudge.get(mover) ?? 0;
    const next = cur + (want - cur) * 0.15;
    nudge.set(mover, next);
    if (Math.abs(next) > 0.5) el.style.transform = `translate3d(${(a.x + next).toFixed(1)}px,${a.y.toFixed(1)}px,0)`;
  }
}
