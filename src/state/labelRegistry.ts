// Registry pairing 3D anchor points with the DOM labels that follow them.
// Kept free of three.js so the panels can load before the 3D office does.

export interface Anchor {
  visible: boolean;
  parent: Anchor | null;
}

export const anchors = new Map<string, Anchor>();
export const elements = new Map<string, HTMLElement>();
const anchorFns = new Map<string, (o: Anchor | null) => void>();
const labelFns = new Map<string, (el: HTMLElement | null) => void>();

/** Stable ref callback for a scene anchor (an Object3D). */
export function anchorRef(key: string) {
  let fn = anchorFns.get(key);
  if (!fn) {
    fn = (o) => { if (o) anchors.set(key, o); else anchors.delete(key); };
    anchorFns.set(key, fn);
  }
  return fn;
}

/** Stable ref callback for the DOM element that follows the anchor with the same key. */
export function labelRef(key: string) {
  let fn = labelFns.get(key);
  if (!fn) {
    fn = (el) => { if (el) elements.set(key, el); else elements.delete(key); };
    labelFns.set(key, fn);
  }
  return fn;
}
