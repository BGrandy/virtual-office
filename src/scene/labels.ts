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
/** Labels stay below this many pixels from the top of the view, clear of the top bar. */
const TOP_EDGE = 78;

function shown(o: Anchor | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function syncLabels(camera: Camera, width: number, height: number, leftInset = 6) {
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
  // Agents' labels clear each other: the nearer one (lower on screen) stays, the farther one rises above it.
  const placed: { x: number; w: number; top: number; bottom: number }[] = [];
  const order = AGENTS.map((id) => `agent:${id}`)
    .filter((k) => projected.has(k))
    .sort((p, q) => projected.get(q)!.y - projected.get(p)!.y);
  for (const key of order) {
    const at = projected.get(key)!;
    const tag = elements.get(key)?.firstElementChild as HTMLElement | null;
    const w = tag?.offsetWidth ?? 90;
    const h = tag?.offsetHeight ?? 44;
    let want = 0;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const o of placed) {
        const bottom = at.y - want;
        if (Math.abs(at.x - o.x) < (w + o.w) / 2 - 6 && bottom > o.top + 2 && bottom - h < o.bottom) {
          want = at.y - (o.top - 2);
          moved = true;
        }
      }
      if (!moved) break;
    }
    want = Math.min(want, 120);
    const got = settle(key, want);
    // Never let a label leave the view: its top edge stops below the top bar,
    // and it slides sideways just enough to stay clear of the side panel and the screen edges.
    const y = Math.max(at.y - got, TOP_EDGE + h);
    const onScreen = at.x > leftInset - 40 && at.x < width + 40;
    const x = onScreen && w < width - leftInset - 12 ? Math.min(Math.max(at.x, leftInset + w / 2), width - 6 - w / 2) : at.x;
    if (y !== at.y - got || x !== at.x) {
      const el = elements.get(key);
      if (el) el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }
    placed.push({ x, w, top: y - h, bottom: y });
  }
  for (const id of AGENTS) if (!projected.has(`agent:${id}`)) lift.delete(`agent:${id}`);
}
