import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3, type PerspectiveCamera } from 'three';
import { AGENT_IDS } from '../sim/data';
import { station } from '../sim/layout';
import { sim, useSim, useUI } from '../state/store';
import { Agent, Packet } from './Actors';
import { Celebrations, HandoffArcs } from './Effects';
import { Office } from './Office';
import { packetTarget } from './helpers';
import { syncLabels } from './labels';

const HOME_TARGET = new Vector3(0, 0.6, -2.4);
const HOME_DIR = new Vector3(0, 16.4, 22.7).normalize();
/** Pull the camera back on narrow or panel-crowded screens so the whole horseshoe stays in view. */
function homePosition(out: Vector3, width: number, height: number) {
  const free = width > 900 ? width - 732 : width;
  const dist = 27 * Math.max(1, (FIT * height) / free);
  return out.copy(HOME_DIR).multiplyScalar(dist).add(HOME_TARGET);
}
const FIT = 1.06;

type Controls = { target: Vector3; update: () => void; addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void };

/** Eases the camera home on load / reset, and tracks the selected agent or task when "follow" is on. */
function CameraRig() {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const reset = useUI((s) => s.cameraReset);
  const homing = useRef(true);
  const tmp = useMemo(() => new Vector3(), []);
  const delta = useMemo(() => new Vector3(), []);
  const home = useMemo(() => new Vector3(), []);
  const followKey = useRef('');
  const zoomLeft = useRef(0);

  const userDragged = useRef(false);
  useEffect(() => { homing.current = true; }, [reset]);
  useEffect(() => {
    if (!controls) return;
    const stop = () => { homing.current = false; zoomLeft.current = 0; userDragged.current = true; };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  // Keep the office centred in the space the panels leave free:
  // side panels on a wide screen, the bottom sheet on a phone.
  const offset = useRef({ x: 0, y: 0, w: 0, h: 0 });
  useFrame((st, dt) => {
    const ui = useUI.getState();
    const wide = st.size.width > 900;
    const wantX = wide ? -((ui.leftOpen ? 348 : 0) - (ui.selected ? 384 : 0)) / 2 : 0;
    const wantY = !wide && (ui.selected || ui.leftOpen) ? st.size.height * 0.24 : !wide && ui.tour ? -st.size.height * 0.12 : 0;
    const o = offset.current;
    const k = 1 - Math.exp(-5 * dt);
    const x = o.x + (wantX - o.x) * k;
    const y = o.y + (wantY - o.y) * k;
    if (Math.abs(x - o.x) > 0.2 || Math.abs(y - o.y) > 0.2 || o.w !== st.size.width || o.h !== st.size.height) {
      Object.assign(o, { x, y, w: st.size.width, h: st.size.height });
      (camera as PerspectiveCamera).setViewOffset(o.w, o.h, x, y, o.w, o.h);
    }
  });

  useFrame((st, dt) => {
    if (!controls) return;
    if (homing.current) {
      homePosition(home, st.size.width, st.size.height);
      const k = 1 - Math.exp(-2.6 * dt);
      camera.position.lerp(home, k);
      controls.target.lerp(HOME_TARGET, k);
      if (camera.position.distanceTo(home) < 0.03) homing.current = false;
      controls.update();
      return;
    }
    // What to track: the tour's focus if there is one, otherwise the followed selection.
    const ui = useUI.getState();
    const subject = ui.focus ?? (ui.follow ? ui.selected : null);
    const key = !subject ? '' : subject === 'overview' ? 'overview' : subject.kind === 'human' ? 'human' : subject.id;
    if (followKey.current !== key) {
      followKey.current = key;
      userDragged.current = false;
      if (key === 'overview') homing.current = true;
      else if (key) zoomLeft.current = 1.6; // swing in to a close-up
    }
    // Once the viewer grabs the camera, leave it alone until the subject changes.
    if (!subject || subject === 'overview' || userDragged.current) return;
    const selected = subject;
    let ok = true;
    if (selected.kind === 'agent') {
      const a = sim.state.agents[selected.id];
      tmp.set(a.pos[0], 1, a.pos[1]);
    } else if (selected.kind === 'human') {
      const st = station('approval');
      tmp.set(st.center[0], 1, st.center[1]);
    } else {
      const t = sim.task(selected.id);
      ok = !!t && packetTarget(t, tmp);
    }
    if (!ok) return;
    delta.copy(tmp).sub(controls.target).multiplyScalar(1 - Math.exp(-2.5 * dt));
    controls.target.add(delta);
    camera.position.add(delta);
    if (zoomLeft.current > 0) {
      zoomLeft.current -= dt;
      const dist = camera.position.distanceTo(controls.target);
      const close = st.size.width > 900 ? 17 : 26; // phones need more of the room in view
      if (dist > close) {
        tmp.copy(camera.position).sub(controls.target).setLength(dist + (close - dist) * (1 - Math.exp(-3 * dt)));
        camera.position.copy(controls.target).add(tmp);
      }
    }
    controls.update();
  });
  // Runs after the camera has moved this frame, so labels never lag behind.
  useFrame((st) => syncLabels(st.camera, st.size.width, st.size.height));
  return null;
}

function Packets() {
  const state = useSim();
  return <>{state.tasks.map((t) => <Packet key={t.id} id={t.id} />)}</>;
}

export default function Scene() {
  const select = useUI((s) => s.select);
  return (
    <Canvas
      shadows
      flat
      dpr={[1, 2]}
      camera={{ position: [0, 30, 36], fov: 40, near: 0.5, far: 260 }}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => select(null)}
    >
      <hemisphereLight args={['#ffffff', '#B8C8DC', 1.5]} />
      <directionalLight
        position={[9, 18, 10]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <Office />
      {AGENT_IDS.map((id) => <Agent key={id} id={id} />)}
      <Packets />
      <HandoffArcs />
      <Celebrations />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={90}
        maxPolarAngle={1.45}
        target={[0, 0.6, -2.4]}
        keyPanSpeed={24}
      />
      <CameraRig />
    </Canvas>
  );
}
