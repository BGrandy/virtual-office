// Keeps the office smooth on modest hardware, such as a reviewer's work laptop.
// - Software renderers and very low core counts start in light mode.
// - In auto mode, a sustained frame-rate drop switches to light mode.
// Light mode turns off shadows (the most expensive pass) and renders at 1x pixel density.

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useUI } from '../state/store';

export function useLightGraphics() {
  const quality = useUI((s) => s.quality);
  const autoLight = useUI((s) => s.autoLight);
  return quality === 'light' || (quality === 'auto' && autoLight);
}

export function QualityManager() {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  const light = useLightGraphics();
  const checked = useRef(false);

  // One-off hardware check.
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (useUI.getState().quality !== 'auto') return;
    let renderer = '';
    try {
      const ctx = gl.getContext();
      const ext = ctx.getExtension('WEBGL_debug_renderer_info');
      renderer = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
    } catch { /* some browsers hide this */ }
    const weak = /swiftshader|llvmpipe|software|basic render/i.test(renderer) || (navigator.hardwareConcurrency ?? 8) <= 2;
    if (weak) useUI.setState({ autoLight: true });
  }, [gl]);

  useEffect(() => {
    setDpr(light ? 1 : Math.min(2, window.devicePixelRatio || 1));
  }, [light, setDpr]);

  return (
    <PerformanceMonitor
      // Below roughly 40 fps for a few seconds counts as struggling.
      bounds={(refresh) => (refresh > 90 ? [50, 90] : [38, 60])}
      flipflops={2}
      onDecline={() => {
        if (useUI.getState().quality === 'auto' && !useUI.getState().autoLight) useUI.setState({ autoLight: true });
      }}
    />
  );
}
