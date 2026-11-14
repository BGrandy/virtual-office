// Completed work that no longer fits on the shelf: cardboard archive crates on
// pallets behind it, plus a floor mat beside each desk where waiting work piles up.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { Group } from 'three';
import { AGENTS, AGENT_IDS } from '../sim/data';
import { AGENT_STATION, station } from '../sim/layout';
import { sim, useSim } from '../state/store';
import { CRATES_PER_PALLET, CRATE_CAPACITY, CRATE_H, boxLayout, crateSpot, pileBase, type CrateSpot } from './boxLayout';
import { useCanvasTexture } from './helpers';

const CARDBOARD = '#C9A46E';
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Crate({ c }: { c: CrateSpot }) {
  const g = useRef<Group>(null!);
  const born = useRef<number | null>(null);
  const label = useCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#F7F1E6';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#14233B';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = '#14233B';
      ctx.textAlign = 'center';
      ctx.font = '800 54px "Bricolage Grotesque Variable", sans-serif';
      ctx.fillText(`Batch ${c.index + 1}`, w / 2, 70);
      ctx.font = '600 34px "Instrument Sans Variable", sans-serif';
      ctx.fillText(`${CRATE_CAPACITY} requests`, w / 2, 118);
    },
    320, 150, `crate-${c.index}`,
  );

  // Drops in from above with a little bounce when it is first packed.
  useFrame(({ clock }) => {
    if (born.current === null) born.current = clock.elapsedTime;
    const t = reducedMotion() ? 2 : clock.elapsedTime - born.current;
    const drop = t < 0.45 ? 1.4 * (1 - t / 0.45) ** 2 : Math.max(0, Math.sin((t - 0.45) * 14) * 0.06 * Math.exp(-(t - 0.45) * 6));
    g.current.position.set(c.x, c.y + drop, c.z);
    const s = Math.min(1, 0.4 + t * 2.5);
    g.current.scale.setScalar(s);
  });

  return (
    <group ref={g} rotation={[0, c.rotY, 0]}>
      <RoundedBox args={[0.95, CRATE_H - 0.02, 0.62]} radius={0.03} castShadow receiveShadow>
        <meshStandardMaterial color={CARDBOARD} roughness={0.9} />
      </RoundedBox>
      {/* packing tape across the lid */}
      <mesh position={[0, CRATE_H / 2 - 0.005, 0]}>
        <boxGeometry args={[0.18, 0.012, 0.63]} />
        <meshStandardMaterial color="#B08A55" roughness={0.6} />
      </mesh>
      {/* label facing the room */}
      {label && (
        <mesh position={[0, 0.02, 0.312]}>
          <planeGeometry args={[0.52, 0.24]} />
          <meshBasicMaterial map={label} />
        </mesh>
      )}
    </group>
  );
}

function Pallet({ index }: { index: number }) {
  const c = crateSpot(index * CRATES_PER_PALLET);
  return (
    <group position={[c.x, 0, c.z]} rotation={[0, c.rotY, 0]}>
      {[-0.42, 0, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.04, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.12, 0.08, 0.78]} />
          <meshStandardMaterial color="#B98F5E" roughness={0.9} />
        </mesh>
      ))}
      {[-0.3, -0.1, 0.1, 0.3].map((z) => (
        <mesh key={z} position={[0, 0.1, z]} receiveShadow castShadow>
          <boxGeometry args={[1.08, 0.04, 0.16]} />
          <meshStandardMaterial color="#CFA571" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export function ArchiveCrates() {
  useSim(); // re-render when the number of crates changes
  const crates = boxLayout(sim).crates;
  const pallets = Math.ceil(crates.length / CRATES_PER_PALLET);
  return (
    <group>
      {Array.from({ length: pallets }, (_, i) => <Pallet key={i} index={i} />)}
      {crates.map((c) => <Crate key={c.index} c={c} />)}
    </group>
  );
}

/** A tinted mat on the floor beside each desk, where that agent's waiting work piles up. */
export function PileMats() {
  const mats = useMemo(
    () => AGENT_IDS.map((id) => {
      const st = station(AGENT_STATION[id]);
      // centred under the first row of four piles
      const [ax, az] = pileBase(st, 0);
      const [bx, bz] = pileBase(st, 3);
      return { id, x: (ax + bx) / 2, z: (az + bz) / 2, rot: st.rotY, color: AGENTS[id].color };
    }),
    [],
  );
  return (
    <>
      {mats.map((m) => (
        <mesh key={m.id} position={[m.x, 0.009, m.z]} rotation={[-Math.PI / 2, 0, m.rot]} receiveShadow>
          <planeGeometry args={[2.35, 0.62]} />
          <meshBasicMaterial color={m.color} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}
