import { useEffect, useState } from 'react';
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three';
import type { Task } from '../sim/types';
import { boxLayout } from './boxLayout';
import { sim } from '../state/store';

export const DESK_TOP = 0.9;

/**
 * Where a task's box should be right now. The scene eases each box toward this
 * point every frame, so the engine never has to animate boxes itself.
 */
export function packetTarget(t: Task, out: Vector3): boolean {
  const spot = boxLayout(sim).spots.get(t.id);
  if (!spot) return false;
  out.set(spot.x, spot.y, spot.z);
  return true;
}

/** Draws crisp text into a texture once the web fonts are ready. */
export function useCanvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, key: string) {
  const [tex, setTex] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    let alive = true;
    let made: CanvasTexture | null = null;
    const make = () => {
      if (!alive) return;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      draw(c.getContext('2d')!, w, h);
      made = new CanvasTexture(c);
      made.colorSpace = SRGBColorSpace;
      made.anisotropy = 8;
      setTex(made);
    };
    (document.fonts?.ready ?? Promise.resolve()).then(make, make);
    return () => {
      alive = false;
      made?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tex;
}

export const lerpAngle = (a: number, b: number, k: number) => {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * k;
};
