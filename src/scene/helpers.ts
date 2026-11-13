import { useEffect, useState } from 'react';
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three';
import { AGENT_STATION, station } from '../sim/layout';
import type { AgentId, Task } from '../sim/types';
import { sim } from '../state/store';

export const DESK_TOP = 0.9;

/**
 * Where a task's box should be right now. The scene eases each box toward this
 * point every frame, so the engine never has to animate boxes itself.
 */
export function packetTarget(t: Task, out: Vector3): boolean {
  const s = sim.state;
  if (t.status === 'cancelled') return false;
  if (t.status === 'handoff') {
    const carrier = Object.values(s.agents).find((a) => a.taskId === t.id);
    if (carrier) {
      out.set(carrier.pos[0] + Math.sin(carrier.heading) * 0.5, 0.95, carrier.pos[1] + Math.cos(carrier.heading) * 0.5);
      return true;
    }
  }
  if (t.status === 'done') {
    const i = s.tasks.filter((x) => x.status === 'done').indexOf(t);
    const st = station('archive');
    const col = i % 4;
    const row = Math.floor(i / 4) % 3;
    const depth = Math.floor(i / 12) * 0.32;
    const off = -0.72 + col * 0.48;
    out.set(st.center[0] + st.tangent[0] * off + st.inward[0] * depth, 0.47 + row * 0.56, st.center[1] + st.tangent[1] * off + st.inward[1] * depth);
    return true;
  }
  if (t.status === 'awaiting-approval' || t.ownerId === 'human') {
    const i = s.tasks.filter((x) => x.status === 'awaiting-approval').indexOf(t);
    const st = station('approval');
    const off = (i % 5) * 0.42 - 0.42;
    out.set(st.center[0] + st.tangent[0] * off + st.inward[0] * 0.15, 1.2, st.center[1] + st.tangent[1] * off + st.inward[1] * 0.15);
    return true;
  }
  const owner = t.ownerId as AgentId;
  const st = station(AGENT_STATION[owner]);
  if (t.status === 'active') {
    out.set(st.center[0] + st.inward[0] * 0.05, DESK_TOP + 0.36, st.center[1] + st.inward[1] * 0.05);
    return true;
  }
  // Queued: stacked in the in-tray on the left of the desk.
  const k = Math.max(0, sim.queueFor(owner).indexOf(t));
  out.set(st.center[0] - st.tangent[0] * 0.78, DESK_TOP + 0.2 + Math.min(k, 5) * 0.3, st.center[1] - st.tangent[1] * 0.78);
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
