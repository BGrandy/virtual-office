// Two effects that make handoffs and completions easy to read at a glance:
// - HandoffArcs: while an agent carries a request, a dashed arc shows where it is going.
// - Celebrations: a short burst at the archive when a request is completed.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Line, LineDashedMaterial, Object3D, QuadraticBezierCurve3, Vector3, type InstancedMesh, type Mesh } from 'three';
import { AGENTS, AGENT_IDS } from '../sim/data';
import type { AgentId } from '../sim/types';
import { sim } from '../state/store';
import { boxLayout } from './boxLayout';

const SEGMENTS = 40;
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Arc({ id }: { id: AgentId }) {
  const ring = useRef<Mesh>(null!);
  const { line, curve, pts } = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
    const mat = new LineDashedMaterial({ color: AGENTS[id].color, dashSize: 0.28, gapSize: 0.18, transparent: true, opacity: 0.9 });
    const l = new Line(geo, mat);
    l.frustumCulled = false;
    return { line: l, curve: new QuadraticBezierCurve3(new Vector3(), new Vector3(), new Vector3()), pts: new Vector3() };
  }, [id]);

  useFrame(({ clock }) => {
    const a = sim.state.agents[id];
    const t = a.taskId ? sim.task(a.taskId) : undefined;
    const on = a.activity === 'carrying' && a.path.length > 0 && !!t?.next;
    line.visible = on;
    ring.current.visible = on;
    if (!on || !t?.next) return;
    const end = a.path[a.path.length - 1];
    const dist = Math.hypot(end[0] - a.pos[0], end[1] - a.pos[1]);
    curve.v0.set(a.pos[0], 1.0, a.pos[1]);
    curve.v2.set(end[0], 0.08, end[1]);
    curve.v1.set((a.pos[0] + end[0]) / 2, 2.0 + dist * 0.3, (a.pos[1] + end[1]) / 2);
    const pos = line.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i <= SEGMENTS; i++) {
      curve.getPoint(i / SEGMENTS, pts);
      pos.setXYZ(i, pts.x, pts.y, pts.z);
    }
    pos.needsUpdate = true;
    line.computeLineDistances();
    // Colour says what kind of handoff it is: rework red, to the supervisor gold, otherwise the carrier's colour.
    const color = t.next.kind === 'rework' ? '#D93A3F' : t.next.ownerId === 'human' ? '#C99700' : t.next.stage === 'done' ? '#14233B' : AGENTS[id].color;
    (line.material as LineDashedMaterial).color.set(color);
    (ring.current.material as unknown as { color: Color }).color.set(color);
    ring.current.position.set(end[0], 0.03, end[1]);
    const s = reducedMotion() ? 1 : 1 + Math.sin(clock.elapsedTime * 6) * 0.12;
    ring.current.scale.set(s, s, s);
  });

  return (
    <>
      <primitive object={line} />
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.42, 0.52, 40]} />
        <meshBasicMaterial transparent opacity={0.85} side={DoubleSide} depthWrite={false} />
      </mesh>
    </>
  );
}

export function HandoffArcs() {
  return <>{AGENT_IDS.map((id) => <Arc key={id} id={id} />)}</>;
}

const N = 26;
const COLORS = ['#FFC53D', '#14233B', '#FFFFFF', '#2A78D6', '#1BAF7A', '#EB6834'];

export function Celebrations() {
  const mesh = useRef<InstancedMesh>(null!);
  const seen = useRef<Set<string> | null>(null);
  const burst = useRef<{ t0: number; origin: Vector3; v: Vector3[]; spin: number[] } | null>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const colorsSet = useRef(false);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const done = sim.state.tasks.filter((t) => t.status === 'done').map((t) => t.id);
    // The first frame records what was already done, so a reload does not fire bursts.
    if (!seen.current) seen.current = new Set(done);
    const fresh = done.filter((id) => !seen.current!.has(id));
    fresh.forEach((id) => seen.current!.add(id));
    if (fresh.length && !reducedMotion()) {
      const top = boxLayout(sim).pyramid.top;
      const origin = new Vector3(top[0], top[1] + 0.4, top[2]);
      const v: Vector3[] = [];
      const spin: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + Math.random() * 0.4;
        const sp = 1.6 + Math.random() * 1.6;
        v.push(new Vector3(Math.cos(a) * sp, 3.2 + Math.random() * 2.2, Math.sin(a) * sp));
        spin.push((Math.random() - 0.5) * 12);
      }
      burst.current = { t0: now, origin, v, spin };
    }
    if (!colorsSet.current && mesh.current) {
      const c = new Color();
      for (let i = 0; i < N; i++) mesh.current.setColorAt(i, c.set(COLORS[i % COLORS.length]));
      if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
      colorsSet.current = true;
    }
    const b = burst.current;
    if (!b) {
      mesh.current.visible = false;
      return;
    }
    const age = now - b.t0;
    if (age > 1.6) {
      burst.current = null;
      mesh.current.visible = false;
      return;
    }
    mesh.current.visible = true;
    const fade = Math.max(0, 1 - Math.max(0, age - 1.0) / 0.6);
    for (let i = 0; i < N; i++) {
      const v = b.v[i];
      dummy.position.set(b.origin.x + v.x * age, Math.max(0.05, b.origin.y + v.y * age - 4.9 * age * age), b.origin.z + v.z * age);
      dummy.rotation.set(b.spin[i] * age, b.spin[i] * age * 0.7, 0);
      dummy.scale.setScalar(fade);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, N]} visible={false} frustumCulled={false}>
      <boxGeometry args={[0.14, 0.03, 0.09]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}
