// Static furniture: floor, the eight stations, the flow line between them, and decor.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CatmullRomCurve3, DoubleSide, Vector3, type Group, type InstancedMesh, type Mesh, Object3D } from 'three';
import { AGENTS, STAGE_META } from '../sim/data';
import { AGENT_STATION, STATIONS, station, type Station } from '../sim/layout';
import type { AgentId, Stage } from '../sim/types';
import { sim, useUI } from '../state/store';
import { DESK_TOP, useCanvasTexture } from './helpers';
import { anchorRef } from './labels';

const INK = '#14233B';
const FLOOR = '#EEF2F6';
const WOOD = '#F7F9FB';

/** Flat label painted on the floor in front of a station: step number + name. */
function FloorLabel({ st, n, title, sub, color }: { st: Station; n: number | null; title: string; sub: string; color: string }) {
  const tex = useCanvasTexture(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      let x = 12;
      if (n !== null) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(64, h / 2, 52, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 62px "Bricolage Grotesque Variable", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), 64, h / 2 + 4);
        x = 140;
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = INK;
      ctx.font = '700 60px "Bricolage Grotesque Variable", sans-serif';
      ctx.fillText(title, x, 74);
      ctx.fillStyle = 'rgba(20,35,59,0.62)';
      ctx.font = '500 34px "Instrument Sans Variable", sans-serif';
      ctx.fillText(sub, x, 122);
    },
    640, 160, `${n}${title}${sub}`,
  );
  if (!tex) return null;
  // Always reads left-to-right from the default camera; pushed further out beside side-on desks.
  const d = 1.2 + 1.4 * Math.abs(st.inward[0]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[st.center[0] + st.inward[0] * d + 0.15, 0.012, st.center[1] + st.inward[1] * d]}>
      <planeGeometry args={[3.4, 0.85]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function StationGroup({ st, children }: { st: Station; children: React.ReactNode }) {
  return (
    <group position={[st.center[0], 0, st.center[1]]} rotation={[0, st.rotY, 0]}>
      {children}
    </group>
  );
}

function Desk({ id, n }: { id: AgentId; n: number }) {
  const p = AGENTS[id];
  const st = station(AGENT_STATION[id]);
  const screen = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    const working = sim.state.agents[id].activity === 'working';
    const m = screen.current.material as unknown as { emissiveIntensity: number };
    m.emissiveIntensity = working ? 0.9 + Math.sin(clock.elapsedTime * 6) * 0.25 : 0.25;
  });
  return (
    <>
    <StationGroup st={st}>
      {/* desk top and legs */}
      <RoundedBox args={[2.3, 0.09, 1]} radius={0.04} position={[0, DESK_TOP - 0.045, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </RoundedBox>
      {[-1.02, 1.02].map((x) => (
        <mesh key={x} position={[x, (DESK_TOP - 0.09) / 2, 0]} castShadow>
          <boxGeometry args={[0.08, DESK_TOP - 0.09, 0.86]} />
          <meshStandardMaterial color="#C9D3DE" roughness={0.5} />
        </mesh>
      ))}
      {/* front panel in the agent's colour, facing the room */}
      <mesh position={[0, 0.5, 0.44]} castShadow>
        <boxGeometry args={[2.0, 0.56, 0.05]} />
        <meshStandardMaterial color={p.color} roughness={0.45} />
      </mesh>
      {/* laptop, facing the agent; kept low so it never hides the agent from the camera */}
      <group position={[0.66, DESK_TOP, -0.02]} rotation={[0, -0.3, 0]}>
        <mesh position={[0, 0.015, -0.14]}>
          <boxGeometry args={[0.6, 0.03, 0.4]} />
          <meshStandardMaterial color="#9AA8B8" roughness={0.4} />
        </mesh>
        <group position={[0, 0.03, 0.06]} rotation={[0.35, 0, 0]}>
          <mesh position={[0, 0.19, 0]} castShadow>
            <boxGeometry args={[0.6, 0.38, 0.03]} />
            <meshStandardMaterial color={INK} roughness={0.4} />
          </mesh>
          <mesh ref={screen} position={[0, 0.19, -0.017]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.54, 0.32]} />
            <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={0.25} />
          </mesh>
        </group>
      </group>
      {/* in-tray */}
      <mesh position={[-0.78, DESK_TOP + 0.02, 0]} receiveShadow>
        <boxGeometry args={[0.46, 0.04, 0.46]} />
        <meshStandardMaterial color="#D5DDE7" />
      </mesh>
    </StationGroup>
    <FloorLabel st={st} n={n} title={STAGE_META[p.stage].label} sub={`${p.name}, ${p.role.toLowerCase()}`} color={p.color} />
    </>
  );
}

function Inbox() {
  const st = station('inbox');
  const glow = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    (glow.current.material as unknown as { opacity: number }).opacity = 0.35 + Math.sin(clock.elapsedTime * 2) * 0.12;
  });
  return (
    <>
    <StationGroup st={st}>
      {/* a mail slot: requests arrive here from the outside world */}
      <RoundedBox args={[1.9, 1.7, 0.5]} radius={0.08} position={[0, 0.85, -0.2]} castShadow receiveShadow>
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 1.15, 0.055]}>
        <planeGeometry args={[1.5, 0.5]} />
        <meshStandardMaterial color={INK} roughness={0.4} />
      </mesh>
      <mesh ref={glow} position={[0, 1.15, 0.06]}>
        <planeGeometry args={[1.3, 0.34]} />
        <meshBasicMaterial color="#FFC53D" transparent opacity={0.4} />
      </mesh>
      <mesh position={[0, 0.5, 0.25]} castShadow>
        <boxGeometry args={[1.5, 0.06, 0.7]} />
        <meshStandardMaterial color={WOOD} />
      </mesh>
    </StationGroup>
    <FloorLabel st={st} n={null} title="Requests in" sub="Email, chat, portal" color={INK} />
    </>
  );
}

function ApprovalConsole() {
  const st = station('approval');
  const select = useUI((s) => s.select);
  const ring = useRef<Mesh>(null!);
  const body = useRef<Group>(null!);
  useFrame(({ clock }) => {
    const w = sim.state.tasks.some((t) => t.status === 'awaiting-approval');
    const m = ring.current.material as unknown as { emissiveIntensity: number; opacity: number };
    m.emissiveIntensity = w ? 1.2 + Math.sin(clock.elapsedTime * 5) * 0.8 : 0.15;
    ring.current.scale.setScalar(w ? 1 + Math.sin(clock.elapsedTime * 5) * 0.03 : 1);
    body.current.position.y = Math.sin(clock.elapsedTime * 1.4) * 0.015;
  });
  return (
    <>
    <StationGroup st={st}>
      {/* raised platform marks the human checkpoint as different from agent desks */}
      <mesh position={[0, 0.04, -0.3]} receiveShadow>
        <cylinderGeometry args={[2.1, 2.2, 0.08, 48]} />
        <meshStandardMaterial color="#FFF4D6" roughness={0.7} />
      </mesh>
      <mesh ref={ring} position={[0, 0.09, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.95, 2.1, 64]} />
        <meshStandardMaterial color="#E5484D" emissive="#E5484D" emissiveIntensity={0.2} side={DoubleSide} />
      </mesh>
      {/* console */}
      <RoundedBox args={[1.7, 0.1, 0.7]} radius={0.04} position={[0, 1.0, 0.1]} castShadow>
        <meshStandardMaterial color={INK} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0.52, 0.1]} castShadow>
        <boxGeometry args={[0.5, 0.9, 0.4]} />
        <meshStandardMaterial color="#FFC53D" roughness={0.5} />
      </mesh>
      {/* the supervisor: a person, deliberately not a robot */}
      <group
        ref={body}
        position={[0, 0.08, -1.2]}
        onClick={(e) => { e.stopPropagation(); select({ kind: 'human' }); }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <mesh position={[0, 0.62, 0]} castShadow>
          <capsuleGeometry args={[0.27, 0.62, 6, 16]} />
          <meshStandardMaterial color={INK} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.38, 0]} castShadow>
          <sphereGeometry args={[0.23, 24, 24]} />
          <meshStandardMaterial color="#F1C9A5" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.42, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.24, 0.03, 8, 24, Math.PI]} />
          <meshStandardMaterial color="#FFC53D" />
        </mesh>
        <group ref={anchorRef('human')} position={[0, 1.85, 0]} />
      </group>
    </StationGroup>
    <FloorLabel st={st} n={5} title="Approve" sub="You decide on risky work" color="#E5484D" />
    </>
  );
}

function Archive() {
  const st = station('archive');
  return (
    <>
    <StationGroup st={st}>
      {[0.2, 0.76, 1.32, 1.88].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.1, 0.06, 0.5]} />
          <meshStandardMaterial color={WOOD} />
        </mesh>
      ))}
      {[-1.05, 1.05].map((x) => (
        <mesh key={x} position={[x, 1.02, 0]} castShadow>
          <boxGeometry args={[0.06, 1.9, 0.5]} />
          <meshStandardMaterial color="#C9D3DE" />
        </mesh>
      ))}
      <mesh position={[0, 1.02, -0.26]}>
        <boxGeometry args={[2.1, 1.9, 0.03]} />
        <meshStandardMaterial color="#D5DDE7" />
      </mesh>
    </StationGroup>
    <FloorLabel st={st} n={null} title="Completed" sub="Closed and on record" color={INK} />
    </>
  );
}

/** A line on the floor through every station, with dots drifting in the direction work flows. */
function FlowLine() {
  const curve = useMemo(() => new CatmullRomCurve3(STATIONS.map((s) => new Vector3(s.visitor[0], 0.02, s.visitor[1])), false, 'catmullrom', 0.5), []);
  const dots = useRef<InstancedMesh>(null!);
  const dummy = useMemo(() => new Object3D(), []);
  const N = 30;
  useFrame(({ clock }) => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shift = reduce ? 0 : (clock.elapsedTime * 0.012) % (1 / N);
    for (let i = 0; i < N; i++) {
      const p = curve.getPointAt(Math.min(0.999, i / N + shift));
      dummy.position.copy(p);
      dummy.updateMatrix();
      dots.current.setMatrixAt(i, dummy.matrix);
    }
    dots.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 160, 0.035, 6, false]} />
        <meshBasicMaterial color="#C3CEDB" />
      </mesh>
      <instancedMesh ref={dots} args={[undefined, undefined, N]}>
        <sphereGeometry args={[0.075, 10, 10]} />
        <meshBasicMaterial color="#8FA1B8" />
      </instancedMesh>
    </group>
  );
}

function Plant({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.24, 0.6, 16]} />
        <meshStandardMaterial color="#F7F9FB" />
      </mesh>
      {[[0, 1.0, 0, 0.5], [0.25, 0.8, 0.1, 0.34], [-0.22, 0.85, -0.12, 0.36]].map(([px, py, pz, r], i) => (
        <mesh key={i} position={[px, py, pz]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={i === 0 ? '#3E9C74' : '#57B38A'} flatShading roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function BackWall() {
  const tex = useCanvasTexture(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = INK;
      ctx.font = '800 150px "Bricolage Grotesque Variable", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('Atrium', 20, h / 2 - 30);
      ctx.fillStyle = 'rgba(20,35,59,0.6)';
      ctx.font = '500 52px "Instrument Sans Variable", sans-serif';
      ctx.fillText('IT service desk, run by agents, supervised by people', 26, h / 2 + 86);
    },
    1536, 320, 'sign',
  );
  return (
    <group position={[0, 0, -12.2]}>
      <mesh position={[0, 1.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[18, 3.4, 0.25]} />
        <meshStandardMaterial color="#F7F9FB" roughness={0.9} />
      </mesh>
      {tex && (
        <mesh position={[-3.2, 2.0, 0.14]}>
          <planeGeometry args={[9.6, 2]} />
          <meshBasicMaterial map={tex} transparent />
        </mesh>
      )}
      {/* window band */}
      {[4.2, 6.3, 8.4].map((x) => (
        <mesh key={x} position={[x - 0.6, 2.0, 0.14]}>
          <planeGeometry args={[1.7, 1.9]} />
          <meshStandardMaterial color="#BFD9F2" emissive="#BFD9F2" emissiveIntensity={0.35} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

export function Office() {
  const stageNumber: Partial<Record<Stage, number>> = { triage: 1, planning: 2, execution: 3, review: 4, delivery: 6 };
  return (
    <group>
      {/* floor slab */}
      <RoundedBox args={[25, 0.5, 22]} radius={0.2} position={[0, -0.25, -3.2]} receiveShadow>
        <meshStandardMaterial color={FLOOR} roughness={0.95} />
      </RoundedBox>
      {/* centre rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, -0.4]} receiveShadow>
        <circleGeometry args={[3.3, 64]} />
        <meshStandardMaterial color="#DCE4EC" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -0.4]}>
        <ringGeometry args={[2.9, 3.0, 64]} />
        <meshBasicMaterial color="#C3CEDB" />
      </mesh>
      <FlowLine />
      <Inbox />
      {(Object.keys(AGENTS) as AgentId[]).map((id) => (
        <Desk key={id} id={id} n={stageNumber[AGENTS[id].stage]!} />
      ))}
      <ApprovalConsole />
      <Archive />
      <BackWall />
      <Plant x={-10.8} z={-11} s={1.3} />
      <Plant x={10.8} z={-11} s={1.3} />
      <Plant x={-11} z={6.4} />
      <Plant x={11} z={6.4} />
    </group>
  );
}
