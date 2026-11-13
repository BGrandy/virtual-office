// Tiny label system: DOM labels that track 3D anchor points.
// Scene objects register an anchor (an empty Object3D); the overlay registers an element
// under the same key; `syncLabels` runs once per frame and projects one onto the other.
// Keeping labels in the main React tree keeps them accessible (real buttons) and crisp.

import { Vector3, type Camera, type Object3D } from 'three';

const anchors = new Map<string, Object3D>();
const elements = new Map<string, HTMLElement>();
const anchorFns = new Map<string, (o: Object3D | null) => void>();
const labelFns = new Map<string, (el: HTMLElement | null) => void>();
const v = new Vector3();

/** Stable ref callback for a scene anchor. */
export function anchorRef(key: string) {
  let fn = anchorFns.get(key);
  if (!fn) {
    fn = (o) => { if (o) anchors.set(key, o); else anchors.delete(key); };
    anchorFns.set(key, fn);
  }
  return fn;
}

/** Stable ref callback for the DOM element that follows the anchor with the same key. */
export function labelRef(key: string) {
  let fn = labelFns.get(key);
  if (!fn) {
    fn = (el) => { if (el) elements.set(key, el); else elements.delete(key); };
    labelFns.set(key, fn);
  }
  return fn;
}

function shown(o: Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function syncLabels(camera: Camera, width: number, height: number) {
  camera.updateMatrixWorld();
  for (const [key, el] of elements) {
    const o = anchors.get(key);
    if (!o || !shown(o)) {
      el.style.display = 'none';
      continue;
    }
    o.getWorldPosition(v).project(camera);
    if (v.z > 1 || v.z < -1) {
      el.style.display = 'none';
      continue;
    }
    el.style.display = '';
    el.style.transform = `translate3d(${(((v.x + 1) / 2) * width).toFixed(1)}px,${(((1 - v.y) / 2) * height).toFixed(1)}px,0)`;
    el.style.zIndex = String(Math.round((1 - v.z) * 5000)); // nearer labels sit on top
  }
}
