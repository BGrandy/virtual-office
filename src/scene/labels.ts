// Projects each registered 3D anchor to the screen and moves its DOM label there.
// Runs once per frame, after the camera has moved.

import { Vector3, type Camera, type Object3D } from 'three';
import { anchors, elements, type Anchor } from '../state/labelRegistry';

export { anchorRef } from '../state/labelRegistry';

const v = new Vector3();

function shown(o: Anchor | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function syncLabels(camera: Camera, width: number, height: number) {
  camera.updateMatrixWorld();
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
    el.style.transform = `translate3d(${(((v.x + 1) / 2) * width).toFixed(1)}px,${(((1 - v.y) / 2) * height).toFixed(1)}px,0)`;
    el.style.zIndex = String(Math.round((1 - v.z) * 5000)); // nearer labels sit on top
  }
}
