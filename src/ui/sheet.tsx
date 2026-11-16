// On a phone the panels are bottom sheets. The bar at the top of a sheet is a real
// handle: drag it down (or flick it) to close the sheet.

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { isNarrow } from '../state/store';

interface HandleProps {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
}

/** Past this many pixels (or a quick flick) the sheet closes; otherwise it springs back. */
const CLOSE_AFTER = 70;

export function useSwipeToClose(onClose: () => void): { panel: RefObject<HTMLElement | null>; handle: HandleProps } {
  const panel = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const move = (dy: number, animate: boolean) => {
    const el = panel.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.18s ease-out' : 'none';
    el.style.transform = dy ? `translateY(${dy}px)` : '';
  };
  const end = (e: ReactPointerEvent, cancelled: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const fast = d.dy > 24 && d.dy / Math.max(1, e.timeStamp - d.t) > 0.5;
    if (!cancelled && (d.dy > CLOSE_AFTER || fast)) {
      move(panel.current?.offsetHeight ?? 400, true);
      setTimeout(onClose, 160);
    } else {
      move(0, true);
    }
  };
  return {
    panel,
    handle: {
      onPointerDown: (e) => {
        if (!isNarrow()) return;
        drag.current = { y: e.clientY, t: e.timeStamp, dy: 0 };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e) => {
        if (!drag.current) return;
        drag.current.dy = Math.max(0, e.clientY - drag.current.y);
        move(drag.current.dy, false);
      },
      onPointerUp: (e) => end(e, false),
      onPointerCancel: (e) => end(e, true),
    },
  };
}

/** The grab bar at the top of a bottom sheet. Hidden on wider screens, where panels are not sheets. */
export function SheetHandle(props: HandleProps) {
  return <div className="sheet-handle" aria-hidden="true" {...props} />;
}
