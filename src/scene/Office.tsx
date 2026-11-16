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
import { CentreAndAnchors } from './Archive';
import { Room } from './Room';
import { anchorRef } from './labels';

const INK = '#14233B';
const WOOD = '#F7F9FB';

/** Flat label painted on the floor in front of a station: step number + name. */
function FloorLabel({ st, n, title, sub, color, dist, side = 0 }: { st: Station; n: number | null; title: string; sub: string; color: string; dist?: number; side?: number }) {
  const tex = useCanvasTexture(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const x = n !== null ? 140 : 28;
      // Solid plate sized to the words, so the route line and anything else on the floor passes underneath.
      ctx.font = '700 60px "Bricolage Grotesque Variable", sans-serif';
      const tw = ctx.measureText(title).width;
      ctx.font = '500 34px "Instrument Sans Variable", sans-serif';
      const sw = ctx.measureText(sub).width;
      const pw = Math.min(w - 8, x + Math.max(tw, sw) + 30);
      ctx.beginPath();
      ctx.roundRect(4, 4, pw, h - 8, 26);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,35,59,0.18)';
      ctx.stroke();
      if (n !== null) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(72, h / 2, 50, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 62px "Bricolage Grotesque Variable", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), 72, h / 2 + 4);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = INK;
      ctx.font = '700 60px "Bricolage Grotesque Variable", sans-serif';
      ctx.fillText(title, x, 76);
      ctx.fillStyle = 'rgba(20,35,59,0.72)';
      ctx.font = '500 34px "Instrument Sans Variable", sans-serif';
      ctx.fillText(sub, x, 124);
    },
    640, 160, `${n}${title}${sub}`,
  );
  if (!tex) return null;
  // Always reads left-to-right from the default camera; pushed further out beside side-on desks.
  const d = dist ?? 1.2 + 1.4 * Math.abs(st.inward[0]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[st.center[0] + st.inward[0] * d + 0.15, 0.1, st.center[1] + st.inward[1] * d + side]} renderOrder={2}>
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
    </StationGroup>
    <FloorLabel st={st} n={n} title={STAGE_META[p.stage].label} sub={`${p.name}, ${p.role.toLowerCase()}`} color={p.color} side={st.key === 'delivery' ? 1.0 : 0} />
    </>
  );
}

/**
 * Where requests enter the office: a counter with a letter tray, under a screen
 * that says "Inbox". A letter drops into the tray each time a request arrives.
 */
function Inbox() {
  const st = station('inbox');
  const screen = useRef<Group>(null!);
  const frame = useRef<Mesh>(null!);
  const letter = useRef<Group>(null!);
  const seen = useRef({ count: sim.state.tasks.length, flash: 0 });
  const tex = useCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      // envelope
      const ex = 56, ey = 70, ew = 200, eh = 140;
      ctx.lineWidth = 12;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.fillStyle = '#FFC53D';
      ctx.beginPath();
      ctx.roundRect(ex, ey, ew, eh, 14);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex + 8, ey + 10);
      ctx.lineTo(ex + ew / 2, ey + eh * 0.58);
      ctx.lineTo(ex + ew - 8, ey + 10);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textBaseline = 'alphabetic';
      ctx.font = '700 132px "Bricolage Grotesque Variable", sans-serif';
      ctx.fillText('Inbox', 296, 178);
      ctx.fillStyle = 'rgba(20,35,59,0.75)';
      ctx.font = '600 44px "Instrument Sans Variable", sans-serif';
      ctx.fillText('Requests arrive here', 300, 244);
    },
    768, 320, 'inbox-screen',
  );
  useFrame((_, dt) => {
    const m = seen.current;
    const count = sim.state.tasks.length;
    if (count > m.count) m.flash = 1;
    m.count = count;
    m.flash = Math.max(0, m.flash - dt * 1.3);
    // The screen's frame lights up and a letter drops from the screen into the tray.
    (frame.current.material as unknown as { emissiveIntensity: number }).emissiveIntensity = m.flash * 1.6;
    screen.current.scale.setScalar(1 + m.flash * 0.06);
    letter.current.visible = m.flash > 0.02;
    const fall = 1 - m.flash; // 0 at the screen, 1 in the tray
    letter.current.position.y = 1.62 - Math.min(1, fall * 1.6) * 0.56;
    letter.current.rotation.z = (1 - Math.min(1, fall * 1.6)) * 0.5;
  });
  const envelope = (x: number, y: number, z: number, rot: number, key: string) => (
    <group key={key} position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.03, 0.33]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.017, -0.055]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[0.22, 0.22]} />
        <meshStandardMaterial color="#D5DDE7" roughness={0.7} />
      </mesh>
    </group>
  );
  return (
    <>
    <StationGroup st={st}>
      {/* counter */}
      <RoundedBox args={[1.9, 0.9, 0.95]} radius={0.06} position={[0, 0.45, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0.925, 0]} castShadow>
        <boxGeometry args={[2, 0.05, 1.05]} />
        <meshStandardMaterial color={INK} roughness={0.5} />
      </mesh>
      {/* letter tray */}
      <group position={[0, 0.95, 0.1]}>
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[1.25, 0.04, 0.72]} />
          <meshStandardMaterial color="#FFC53D" roughness={0.5} />
        </mesh>
        {[-0.625, 0.625].map((x) => (
          <mesh key={x} position={[x, 0.1, 0]} castShadow>
            <boxGeometry args={[0.04, 0.2, 0.72]} />
            <meshStandardMaterial color="#FFC53D" roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 0.1, -0.36]} castShadow>
          <boxGeometry args={[1.29, 0.2, 0.04]} />
          <meshStandardMaterial color="#FFC53D" roughness={0.5} />
        </mesh>
        {envelope(-0.3, 0.06, 0.02, 0.2, 'e1')}
        {envelope(0.28, 0.06, 0.08, -0.35, 'e2')}
        {envelope(-0.02, 0.095, -0.02, 0.05, 'e3')}
      </group>
      {/* the letter that drops in when a request arrives */}
      <group ref={letter} position={[0, 1.62, 0.1]} visible={false}>
        <mesh>
          <boxGeometry args={[0.5, 0.03, 0.33]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.7} />
        </mesh>
      </group>
      {/* screen on a post behind the tray */}
      <mesh position={[0, 1.4, -0.4]} castShadow>
        <boxGeometry args={[0.14, 0.95, 0.1]} />
        <meshStandardMaterial color={INK} roughness={0.5} />
      </mesh>
      <group ref={screen} position={[0, 2.25, -0.4]} rotation={[-0.1, 0, 0]}>
        <mesh ref={frame} castShadow>
          <boxGeometry args={[2.5, 1.1, 0.1]} />
          <meshStandardMaterial color={INK} roughness={0.5} emissive="#FFC53D" emissiveIntensity={0} />
        </mesh>
        {tex && (
          <mesh position={[0, 0, 0.056]}>
            <planeGeometry args={[2.36, 0.98]} />
            <meshBasicMaterial map={tex} />
          </mesh>
        )}
      </group>
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
      <mesh position={[0, 0.04, -0.6]} receiveShadow>
        <cylinderGeometry args={[1.55, 1.62, 0.08, 48]} />
        <meshStandardMaterial color="#FFF4D6" roughness={0.7} />
      </mesh>
      <mesh ref={ring} position={[0, 0.09, -0.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.43, 1.56, 64]} />
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
    <FloorLabel st={st} n={5} title="Approve" sub="You decide on risky work" color="#E5484D" dist={2.7} />
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
        <meshBasicMaterial color="#B7A98F" />
      </mesh>
      <instancedMesh ref={dots} args={[undefined, undefined, N]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshBasicMaterial color="#8C7B5E" />
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

export function Office() {
  const stageNumber: Partial<Record<Stage, number>> = { triage: 1, planning: 2, execution: 3, review: 4, delivery: 6 };
  return (
    <group>
      <Room />
      <FlowLine />
      <Inbox />
      {(Object.keys(AGENTS) as AgentId[]).map((id) => (
        <Desk key={id} id={id} n={stageNumber[AGENTS[id].stage]!} />
      ))}
      <ApprovalConsole />
      <CentreAndAnchors />
      <FloorLabel st={station('archive')} n={null} title="Completed" sub="Every finished request" color={INK} dist={3.35} />
      <Plant x={-11.2} z={-12.6} s={1.3} />
      <Plant x={9.6} z={-12.8} s={1.2} />
      <Plant x={-11.3} z={6.5} />
      <Plant x={11.2} z={2.6} s={0.9} />
    </group>
  );
}
