// Things that move: agent avatars and task boxes.
// Positions come straight from the engine each frame; React only re-renders the DOM labels.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { Vector3, type Group, type Mesh } from 'three';
import { AGENTS } from '../sim/data';
import { station } from '../sim/layout';
import type { AgentId } from '../sim/types';
import { sim, useSim, useUI } from '../state/store';
import { lerpAngle } from './helpers';
import { boxLayout, jitter } from './boxLayout';
import { anchorRef } from './labels';

const hover = (on: boolean) => (document.body.style.cursor = on ? 'pointer' : '');

export function Agent({ id }: { id: AgentId }) {
  const p = AGENTS[id];
  const root = useRef<Group>(null!);
  const bob = useRef<Group>(null!);
  const head = useRef<Group>(null!);
  const eyes = useRef<Group>(null!);
  const tip = useRef<Mesh>(null!);
  const ring = useRef<Mesh>(null!);
  const hands = useRef<Group>(null!);
  const phase = useMemo(() => id.charCodeAt(0) * 1.7, [id]);

  const selected = useUI((s) => s.selected?.kind === 'agent' && s.selected.id === id);
  const select = useUI((s) => s.select);

  useFrame(({ clock }, dt) => {
    const ag = sim.state.agents[id];
    const t = clock.elapsedTime + phase;
    root.current.position.set(ag.pos[0], 0, ag.pos[1]);
    root.current.rotation.y = lerpAngle(root.current.rotation.y, ag.heading, 1 - Math.exp(-12 * dt));
    const working = ag.activity === 'working';
    const moving = ag.activity === 'carrying' || ag.activity === 'returning';
    bob.current.position.y = 0.1 + Math.sin(t * (moving ? 9 : 2)) * (moving ? 0.03 : 0.025);
    bob.current.rotation.x = moving ? 0.1 : 0;
    head.current.rotation.x += ((working ? 0.32 : 0) - head.current.rotation.x) * 0.1;
    // Working: small glances at the screen. Idle: slowly looking around the room.
    head.current.rotation.y = working ? Math.sin(t * 1.3) * 0.18 : ag.activity === 'idle' ? Math.sin(t * 0.35) * 0.5 : 0;
    eyes.current.scale.y = Math.sin(t * 0.9) > 0.985 ? 0.1 : 1; // blink
    (tip.current.material as unknown as { emissiveIntensity: number }).emissiveIntensity = working ? 1.2 + Math.sin(t * 8) * 0.8 : 0.3;
    const carrying = ag.activity === 'carrying';
    hands.current.position.z += ((carrying ? 0.34 : 0) - hands.current.position.z) * 0.2;
    hands.current.position.y += ((carrying ? 0.12 : 0) - hands.current.position.y) * 0.2;
    const s = selected ? 1.25 + Math.sin(t * 4) * 0.04 : 1;
    ring.current.scale.set(s, s, s);
  });

  return (
    <group
      ref={root}
      onClick={(e) => { e.stopPropagation(); select({ kind: 'agent', id }); }}
      onPointerOver={() => hover(true)}
      onPointerOut={() => hover(false)}
    >
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.44, selected ? 0.56 : 0.5, 40]} />
        <meshBasicMaterial color={p.color} transparent opacity={selected ? 0.95 : 0.45} />
      </mesh>
      <group ref={bob}>
        {/* body */}
        <mesh position={[0, 0.55, 0]} castShadow>
          <capsuleGeometry args={[0.29, 0.42, 6, 20]} />
          <meshStandardMaterial color="#FBFCFD" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.297, 0.297, 0.13, 24]} />
          <meshStandardMaterial color={p.color} roughness={0.4} />
        </mesh>
        <group ref={hands}>
          {[-0.36, 0.36].map((x) => (
            <mesh key={x} position={[x * (1 - 0), 0.58, 0]} castShadow>
              <sphereGeometry args={[0.09, 12, 12]} />
              <meshStandardMaterial color={p.color} roughness={0.4} />
            </mesh>
          ))}
        </group>
        {/* head */}
        <group ref={head} position={[0, 1.2, 0]}>
          <RoundedBox args={[0.6, 0.44, 0.48]} radius={0.12} castShadow>
            <meshStandardMaterial color={p.color} roughness={0.35} />
          </RoundedBox>
          <RoundedBox args={[0.46, 0.24, 0.04]} radius={0.02} position={[0, 0, 0.235]}>
            <meshStandardMaterial color="#14233B" roughness={0.2} />
          </RoundedBox>
          <group ref={eyes} position={[0, 0, 0.262]}>
            {[-0.11, 0.11].map((x) => (
              <mesh key={x} position={[x, 0, 0]}>
                <circleGeometry args={[0.045, 16]} />
                <meshBasicMaterial color="#fff" />
              </mesh>
            ))}
          </group>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.18, 6]} />
            <meshStandardMaterial color="#9AA8B8" />
          </mesh>
          <mesh ref={tip} position={[0, 0.41, 0]}>
            <sphereGeometry args={[0.055, 12, 12]} />
            <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={0.3} />
          </mesh>
        </group>
      </group>
      <group ref={anchorRef(`agent:${id}`)} position={[0, 1.95, 0]} />
    </group>
  );
}

export function Packet({ id }: { id: string }) {
  const root = useRef<Group>(null!);
  const box = useRef<Group>(null!);
  const halo = useRef<Mesh>(null!);
  const tgt = useMemo(() => new Vector3(), []);
  const started = useRef(false);

  const state = useSim();
  const t = state.tasks.find((x) => x.id === id);
  const selected = useUI((s) => s.selected?.kind === 'task' && s.selected.id === id);
  const select = useUI((s) => s.select);
  // Requests are neutral paper boxes so they never borrow an agent's colour; red means it needs you.
  const alert = t?.status === 'awaiting-approval';
  const color = alert ? '#D93A3F' : '#FFFFFF';

  useFrame(({ clock }, dt) => {
    const task = sim.task(id);
    const spot = task ? boxLayout(sim).spots.get(id) : undefined;
    if (!task || !spot) {
      root.current.visible = false;
      return;
    }
    tgt.set(spot.x, spot.y, spot.z);
    const pos = root.current.position;
    if (!started.current) {
      started.current = true;
      const fresh = task.stage === 'triage' && task.history.length === 0 && task.progress < 0.2;
      if (fresh) {
        const inbox = station('inbox');
        pos.set(inbox.center[0], 1.15, inbox.center[1]);
      } else pos.copy(tgt);
    }
    const dist = pos.distanceTo(tgt);
    pos.lerp(tgt, 1 - Math.exp(-(spot.carried ? 20 : spot.packed ? 3 : 4) * dt));
    // Boxes that travel on their own (arriving, approved, packed) hop in an arc.
    box.current.position.y = spot.carried ? 0 : Math.min(dist, 4) * 0.3;
    // Packed boxes shrink into their crate and disappear.
    const scale = spot.packed ? Math.min(1, dist / 1.2) : 1;
    box.current.scale.setScalar(Math.max(0.001, scale));
    root.current.visible = scale > 0.03;
    const waiting = task.status === 'awaiting-approval';
    if (spot.spinning) box.current.rotation.y += dt * 1.8;
    else box.current.rotation.y = lerpAngle(box.current.rotation.y, spot.rotY, 1 - Math.exp(-8 * dt));
    // A small wobble while a box sits in a pile, so the stacks feel alive.
    box.current.rotation.z = !spot.carried && !spot.spinning && !spot.packed && task.status === 'queued' ? Math.sin(clock.elapsedTime * 1.3 + jitter(id) * 6) * 0.02 : 0;
    halo.current.visible = waiting || selected;
    if (halo.current.visible) {
      const s = 1 + (waiting ? Math.sin(clock.elapsedTime * 5) * 0.18 : 0);
      halo.current.scale.set(s, s, s);
    }
  });

  if (!t || t.status === 'cancelled') return <group ref={root}><group ref={box}><mesh ref={halo} /></group></group>;
  return (
    <group ref={root}>
      <group ref={box}>
        <group
          onClick={(e) => { e.stopPropagation(); select({ kind: 'task', id }); }}
          onPointerOver={() => hover(true)}
          onPointerOut={() => hover(false)}
        >
          <RoundedBox args={[0.4, 0.28, 0.34]} radius={0.04} castShadow>
            <meshStandardMaterial color={color} roughness={0.5} emissive={color} emissiveIntensity={alert ? 0.35 : 0.05} transparent={t.held} opacity={t.held ? 0.4 : 1} />
          </RoundedBox>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.405, 0.07, 0.345]} />
            <meshStandardMaterial color={alert ? '#FFFFFF' : '#14233B'} roughness={0.5} transparent={t.held} opacity={t.held ? 0.4 : 1} />
          </mesh>
        </group>
        <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} visible={false}>
          <ringGeometry args={[0.3, 0.37, 32]} />
          <meshBasicMaterial color={alert ? '#D93A3F' : '#14233B'} transparent opacity={0.9} />
        </mesh>
        <group ref={anchorRef(`task:${id}`)} position={[0, 0.2, 0]} />
      </group>
    </group>
  );
}
