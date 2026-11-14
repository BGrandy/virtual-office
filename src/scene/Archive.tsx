// The centre of the room, where completed work builds a pyramid, plus the anchor
// points that the "+N more" tags on desk towers and the completed counter follow.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { AGENT_IDS } from '../sim/data';
import { AGENT_STATION, ROOM_CENTRE, station } from '../sim/layout';
import type { AgentId } from '../sim/types';
import { sim } from '../state/store';
import { boxLayout, towerBase } from './boxLayout';
import { anchorRef } from './labels';

/** A low round plinth the pyramid stands on, with a gold rim: it is the team's trophy. */
export function Plinth() {
  return (
    <group position={[ROOM_CENTRE[0], 0, ROOM_CENTRE[1]]}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[2.75, 2.85, 0.04, 64]} />
        <meshStandardMaterial color="#F4F7FA" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.042, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.62, 2.75, 64]} />
        <meshStandardMaterial color="#FFC53D" roughness={0.5} />
      </mesh>
    </group>
  );
}

function TowerAnchor({ id }: { id: AgentId }) {
  const g = useRef<Group | null>(null);
  const ref = anchorRef(`tower:${id}`);
  useFrame(() => {
    if (!g.current) return;
    const t = boxLayout(sim).towers[id];
    g.current.position.set(t.x, t.topY + 0.2, t.z);
    g.current.visible = t.count > 0;
  });
  return <group ref={(o) => { g.current = o; ref(o); }} />;
}

function PyramidAnchor() {
  const g = useRef<Group | null>(null);
  const ref = anchorRef('archive');
  useFrame(() => {
    if (!g.current) return;
    const p = boxLayout(sim).pyramid;
    g.current.position.set(p.top[0], p.top[1] + 0.55, p.top[2]);
    g.current.visible = p.count > 0;
  });
  return <group ref={(o) => { g.current = o; ref(o); }} />;
}

/** The in-tray each desk tower stands in. */
function Tray({ id }: { id: AgentId }) {
  const st = station(AGENT_STATION[id]);
  const [x, z] = towerBase(st);
  return (
    <group position={[x, 0.9, z]} rotation={[0, st.rotY, 0]}>
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[0.52, 0.03, 0.46]} />
        <meshStandardMaterial color="#D5DDE7" roughness={0.7} />
      </mesh>
      {[-0.25, 0.25].map((dx) => (
        <mesh key={dx} position={[dx, 0.05, 0]}>
          <boxGeometry args={[0.02, 0.07, 0.46]} />
          <meshStandardMaterial color="#C3CEDB" />
        </mesh>
      ))}
    </group>
  );
}

export function CentreAndAnchors() {
  return (
    <>
      <Plinth />
      {AGENT_IDS.map((id) => <Tray key={id} id={id} />)}
      <PyramidAnchor />
      {AGENT_IDS.map((id) => <TowerAnchor key={id} id={id} />)}
    </>
  );
}
