// The room itself: wood floor, three walls with windows, and office furniture.
// It is a cutaway: the front is open to the default camera, and any wall the
// camera moves behind hides itself, so the walls never block the view.

import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { RepeatWrapping, type Group } from 'three';
import { useCanvasTexture } from './helpers';

const INK = '#14233B';
const WALL = '#F4F6F8';
const TRIM = '#C9D3DE';

/** Room footprint: x from -HALF_W to HALF_W, z from BACK to FRONT (open). */
export const ROOM = { halfW: 12.3, back: -13.9, front: 7.6, height: 4.4 };
const DEPTH = ROOM.front - ROOM.back;
const MID_Z = (ROOM.front + ROOM.back) / 2;

// ------------------------------------------------------------------- textures

/** Light oak planks. Deterministic, so it looks the same on every load. */
function useWoodTexture() {
  const tex = useCanvasTexture(
    (ctx, w, h) => {
      const rows = 8;
      const rh = h / rows;
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let r = 0; r < rows; r++) {
        let x = -rnd() * 300;
        while (x < w) {
          const len = 260 + rnd() * 260;
          const tone = 222 + Math.floor(rnd() * 14);
          ctx.fillStyle = `rgb(${tone + 6},${tone - 4},${tone - 26})`;
          ctx.fillRect(x, r * rh, len, rh);
          ctx.fillStyle = 'rgba(120,95,60,0.16)';
          ctx.fillRect(x + len - 2, r * rh, 2, rh);
          x += len;
        }
        ctx.fillStyle = 'rgba(120,95,60,0.2)';
        ctx.fillRect(0, r * rh, w, 2);
      }
    },
    1024, 512, 'wood',
  );
  if (tex) {
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(4, 7);
  }
  return tex;
}

/** City view for the windows: sky and a few building silhouettes. */
function useSkylineTexture() {
  return useCanvasTexture(
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#A9D2F5');
      g.addColorStop(1, '#EAF4FC');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (const [tone, base] of [['#C5D6E8', 0.62], ['#9FB6CE', 0.42]] as const) {
        let x = -20;
        while (x < w) {
          const bw = 40 + rnd() * 70;
          const bh = h * (base * (0.45 + rnd() * 0.55));
          ctx.fillStyle = tone;
          ctx.fillRect(x, h - bh, bw, bh);
          x += bw + 6 + rnd() * 30;
        }
      }
      // a couple of clouds
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const [cx, cy, r] of [[120, 70, 26], [150, 62, 34], [185, 72, 24], [420, 100, 22], [448, 92, 30]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    640, 400, 'skyline',
  );
}

function useSignTexture() {
  return useCanvasTexture(
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
}

/** Whiteboard sketch of the workflow, as a team would draw it. */
function useWhiteboardTexture() {
  return useCanvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = INK;
      ctx.font = '700 44px "Bricolage Grotesque Variable", sans-serif';
      ctx.fillText('How a request moves', 40, 70);
      const steps = ['Request', 'Plan', 'Execute', 'Review', 'Approve', 'Complete'];
      const colors = ['#2A78D6', '#EB6834', '#1BAF7A', '#6250D6', '#D93A3F', '#E87BA4'];
      // One row, left to right, so the order can only be read one way.
      const gap = 138;
      const x0 = 85;
      const y = 210;
      steps.forEach((s, i) => {
        const x = x0 + i * gap;
        const optional = i === 4;
        ctx.strokeStyle = colors[i];
        ctx.lineWidth = 7;
        ctx.setLineDash(optional ? [12, 9] : []);
        ctx.beginPath();
        ctx.arc(x, y, 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = colors[i];
        ctx.font = '700 40px "Bricolage Grotesque Variable", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), x, y + 14);
        ctx.fillStyle = INK;
        ctx.font = '600 27px "Instrument Sans Variable", sans-serif';
        ctx.fillText(s, x, y + 82);
        if (i < steps.length - 1) {
          ctx.strokeStyle = '#7A889C';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x + 50, y);
          ctx.lineTo(x + gap - 50, y);
          ctx.lineTo(x + gap - 62, y - 9);
          ctx.moveTo(x + gap - 50, y);
          ctx.lineTo(x + gap - 62, y + 9);
          ctx.stroke();
        }
      });
      // Step 5 is the only one that doesn't always happen.
      const ax = x0 + 4 * gap;
      ctx.strokeStyle = '#D93A3F';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax, y + 100);
      ctx.lineTo(ax, y + 132);
      ctx.stroke();
      ctx.fillStyle = '#D93A3F';
      ctx.font = '600 27px "Instrument Sans Variable", sans-serif';
      ctx.fillText('Risky work only: a person decides', ax - 60, y + 166);
      ctx.textAlign = 'left';
    },
    860, 440, 'whiteboard',
  );
}

// ---------------------------------------------------------------------- walls

/**
 * A wall whose local +Z faces into the room. It hides itself (with everything
 * mounted on it) whenever the camera is on its outer side.
 */
function Wall({ position, rotY, width, children }: { position: [number, number, number]; rotY: number; width: number; children?: ReactNode }) {
  const g = useRef<Group>(null!);
  const nx = Math.sin(rotY);
  const nz = Math.cos(rotY);
  useFrame(({ camera }) => {
    const inside = (camera.position.x - position[0]) * nx + (camera.position.z - position[2]) * nz;
    g.current.visible = inside > 0.5;
  });
  return (
    <group ref={g} position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, ROOM.height / 2, -0.125]} receiveShadow>
        <boxGeometry args={[width, ROOM.height, 0.25]} />
        <meshStandardMaterial color={WALL} roughness={0.95} />
      </mesh>
      {/* skirting board */}
      <mesh position={[0, 0.09, 0.02]}>
        <boxGeometry args={[width, 0.18, 0.04]} />
        <meshStandardMaterial color={TRIM} roughness={0.7} />
      </mesh>
      {children}
    </group>
  );
}

function Window({ x, w = 2.6, h = 2.1, y = 2.35, view }: { x: number; w?: number; h?: number; y?: number; view: ReturnType<typeof useSkylineTexture> }) {
  return (
    <group position={[x, y, 0.01]}>
      <mesh>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.06]} />
        <meshStandardMaterial color={TRIM} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[w, h]} />
        {view ? <meshBasicMaterial key="tex" map={view} /> : <meshBasicMaterial key="plain" color="#BFD9F2" />}
      </mesh>
      {/* glazing bars */}
      <mesh position={[0, 0, 0.045]}>
        <boxGeometry args={[0.05, h, 0.02]} />
        <meshStandardMaterial color={TRIM} />
      </mesh>
      {/* sill */}
      <mesh position={[0, -h / 2 - 0.1, 0.1]}>
        <boxGeometry args={[w + 0.3, 0.06, 0.22]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Clock({ x, y }: { x: number; y: number }) {
  const hand = useRef<Group>(null!);
  useFrame(({ clock }) => {
    hand.current.rotation.z = -clock.elapsedTime * 0.5;
  });
  return (
    <group position={[x, y, 0.03]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.05, 32]} />
        <meshStandardMaterial color={INK} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[0.31, 32]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.09, 0.035]}>
        <boxGeometry args={[0.035, 0.2, 0.01]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <group ref={hand} position={[0, 0, 0.04]}>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.02, 0.26, 0.01]} />
          <meshBasicMaterial color="#D93A3F" />
        </mesh>
      </group>
    </group>
  );
}

function Door({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0.02]}>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[1.5, 2.4, 0.06]} />
        <meshStandardMaterial color={TRIM} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.16, 0.035]}>
        <boxGeometry args={[1.3, 2.28, 0.04]} />
        <meshStandardMaterial color="#DDE5EE" roughness={0.7} />
      </mesh>
      <mesh position={[0.5, 1.15, 0.08]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#FFC53D" roughness={0.3} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ furniture

function Sofa({ x, z, rotY }: { x: number; z: number; rotY: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <RoundedBox args={[2.6, 0.45, 1]} radius={0.1} position={[0, 0.32, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2A3B57" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[2.6, 0.75, 0.28]} radius={0.1} position={[0, 0.7, -0.42]} castShadow>
        <meshStandardMaterial color="#2A3B57" roughness={0.9} />
      </RoundedBox>
      {[-1.2, 1.2].map((ax) => (
        <RoundedBox key={ax} args={[0.26, 0.6, 1]} radius={0.1} position={[ax, 0.5, 0]} castShadow>
          <meshStandardMaterial color="#233349" roughness={0.9} />
        </RoundedBox>
      ))}
      <RoundedBox args={[0.55, 0.4, 0.16]} radius={0.07} position={[-0.7, 0.72, -0.2]} rotation={[-0.25, 0, 0.1]} castShadow>
        <meshStandardMaterial color="#FFC53D" roughness={0.8} />
      </RoundedBox>
      {/* coffee table */}
      <mesh position={[0, 0.34, 1.35]} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.06, 32]} />
        <meshStandardMaterial color="#F7F9FB" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.16, 1.35]}>
        <cylinderGeometry args={[0.06, 0.2, 0.32, 16]} />
        <meshStandardMaterial color={TRIM} />
      </mesh>
      <mesh position={[0.15, 0.42, 1.3]} castShadow>
        <cylinderGeometry args={[0.07, 0.06, 0.12, 16]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
    </group>
  );
}

function WaterCooler({ x, z, rotY }: { x: number; z: number; rotY: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <RoundedBox args={[0.5, 1.05, 0.5]} radius={0.05} position={[0, 0.53, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#F7F9FB" roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 1.38, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.6, 20]} />
        <meshStandardMaterial color="#8CC8F2" transparent opacity={0.75} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.8, 0.26]}>
        <boxGeometry args={[0.2, 0.08, 0.04]} />
        <meshStandardMaterial color={INK} />
      </mesh>
    </group>
  );
}

function Bookshelf({ x, z, rotY }: { x: number; z: number; rotY: number }) {
  const spines = ['#2A78D6', '#EB6834', '#1BAF7A', '#6250D6', '#E87BA4', '#FFC53D', '#14233B'];
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 2.2, 0.42]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.7} />
      </mesh>
      {[0.42, 0.98, 1.54].map((y, row) => (
        <group key={y}>
          <mesh position={[0, y + 0.2, 0.06]}>
            <boxGeometry args={[2.04, 0.48, 0.34]} />
            <meshStandardMaterial color="#E6ECF2" roughness={0.9} />
          </mesh>
          {Array.from({ length: 12 }, (_, i) => {
            const hgt = 0.3 + ((i * 7 + row * 3) % 5) * 0.03;
            return (
              <mesh key={i} position={[-0.9 + i * 0.16, y + hgt / 2 - 0.03, 0.12]}>
                <boxGeometry args={[0.12, hgt, 0.26]} />
                <meshStandardMaterial color={spines[(i + row * 2) % spines.length]} roughness={0.8} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function PrinterStand({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[1.3, 0.8, 0.6]} radius={0.04} position={[0, 0.4, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#FFFFFF" roughness={0.7} />
      </RoundedBox>
      <RoundedBox args={[0.8, 0.34, 0.5]} radius={0.05} position={[0, 0.97, 0]} castShadow>
        <meshStandardMaterial color="#DDE5EE" roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 1.02, 0.27]}>
        <boxGeometry args={[0.5, 0.02, 0.2]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0.28, 1.15, 0.12]}>
        <boxGeometry args={[0.14, 0.01, 0.1]} />
        <meshStandardMaterial color="#1BAF7A" emissive="#1BAF7A" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

// ----------------------------------------------------------------------- room

export function Room() {
  const wood = useWoodTexture();
  const view = useSkylineTexture();
  const sign = useSignTexture();
  const board = useWhiteboardTexture();
  const sideW = DEPTH;
  return (
    <group>
      {/* floor */}
      <mesh position={[0, -0.25, MID_Z]} receiveShadow>
        <boxGeometry args={[ROOM.halfW * 2 + 0.5, 0.5, DEPTH + 0.5]} />
        <meshStandardMaterial color="#D8CDB8" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, MID_Z]} receiveShadow>
        <planeGeometry args={[ROOM.halfW * 2, DEPTH]} />
        {wood ? <meshStandardMaterial key="tex" map={wood} roughness={0.85} /> : <meshStandardMaterial key="plain" color="#E9DFCF" roughness={0.85} />}
      </mesh>

      {/* back wall: sign, windows, clock */}
      <Wall position={[0, 0, ROOM.back]} rotY={0} width={ROOM.halfW * 2 + 0.5}>
        {sign && (
          <mesh position={[-5.2, 2.5, 0.02]}>
            <planeGeometry args={[9.6, 2]} />
            <meshBasicMaterial map={sign} transparent />
          </mesh>
        )}
        <Clock x={1.2} y={3.2} />
        <Window x={4.4} view={view} />
        <Window x={7.5} view={view} />
        <Window x={10.6} w={2.2} view={view} />
      </Wall>

      {/* left wall: a row of windows */}
      <Wall position={[-ROOM.halfW, 0, MID_Z]} rotY={Math.PI / 2} width={sideW}>
        {[-7.2, -3.6, 0, 3.6, 7.2].map((x) => <Window key={x} x={x} w={2.8} view={view} />)}
      </Wall>

      {/* right wall: door, whiteboard */}
      <Wall position={[ROOM.halfW, 0, MID_Z]} rotY={-Math.PI / 2} width={sideW}>
        <Door x={-8.2} />
        <group position={[2.6, 2.3, 0.02]}>
          <mesh>
            <boxGeometry args={[4.5, 2.4, 0.06]} />
            <meshStandardMaterial color={TRIM} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <planeGeometry args={[4.3, 2.2]} />
            {board ? <meshBasicMaterial key="tex" map={board} /> : <meshBasicMaterial key="plain" color="#FFFFFF" />}
          </mesh>
        </group>
        <Window x={7.6} w={2.6} view={view} />
      </Wall>

      {/* furniture around the edges, clear of the walking paths */}
      <Sofa x={10.4} z={5.6} rotY={-Math.PI / 2} />
      <WaterCooler x={-11.6} z={2.2} rotY={Math.PI / 2} />
      <Bookshelf x={11.9} z={-10.6} rotY={-Math.PI / 2} />
      <PrinterStand x={1.6} z={-13.3} />
    </group>
  );
}
