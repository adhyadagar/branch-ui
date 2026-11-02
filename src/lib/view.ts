import type { Point } from "./types";
import { CARD_W, SLOT_ID, type Positions } from "./layout";

/**
 * The camera and the card positions live outside React. They change every animation
 * frame, and re-rendering every card that often would make panning stutter.
 */

export const SLOT_ZOOM = 0.95; // Close enough that a card-width bar is comfortable to type in.
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 1.6;
const GLIDE_MS = 420;

export type Camera = Point & { s: number };

export const scene = {
  positions: {} as Positions,
  /** What's on screen right now, which differs from `positions` during a glide. */
  shown: {} as Positions,
  heights: {} as Record<string, number>,
  widthOf: (() => CARD_W) as (id: string) => number,
  slotHeight: 110,
  /** Where the threads panel ends, so the camera doesn't put a card behind it. */
  panelRight: 0,
  /** The same for the guide, measured from the right edge of the screen. */
  rightInset: 0,
};

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/* ---------- Camera ---------- */

let camera: Camera = { x: 80, y: 120, s: 1 };
const cameraSubs = new Set<() => void>();
let cameraAnim = 0;

export const getCamera = () => camera;

export function subscribeCamera(fn: () => void) {
  cameraSubs.add(fn);
  return () => void cameraSubs.delete(fn);
}

export function setCamera(next: Camera) {
  camera = next;
  cameraSubs.forEach((fn) => fn());
}

export function stopCamera() {
  cancelAnimationFrame(cameraAnim);
}

export function animateTo(x: number, y: number, s: number) {
  stopCamera();
  if (prefersReducedMotion()) return setCamera({ x, y, s });
  const from = camera;
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / GLIDE_MS);
    const e = easeOut(k);
    setCamera({ x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e, s: from.s + (s - from.s) * e });
    if (k < 1) cameraAnim = requestAnimationFrame(step);
  };
  cameraAnim = requestAnimationFrame(step);
}

export function zoomAt(factor: number, cx: number, cy: number) {
  const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.s * factor));
  const k = s / camera.s;
  setCamera({ x: cx - (cx - camera.x) * k, y: cy - (cy - camera.y) * k, s });
}

export function zoomFromCenter(factor: number) {
  stopCamera();
  zoomAt(factor, innerWidth / 2, innerHeight / 2);
}

/** The part of the screen not covered by floating controls. */
function viewArea() {
  const phone = innerWidth <= 760;
  const l = phone ? 12 : Math.max(72, scene.panelRight);
  const t = phone ? 112 : 68;
  const r = phone ? 16 : Math.max(16, scene.rightInset);
  return { l, t, w: innerWidth - l - r, h: innerHeight - t - 118 };
}

export function flyTo(id: string, minZoom = 0.85) {
  const p = scene.positions[id];
  if (!p) return;
  const a = viewArea();
  const w = scene.widthOf(id);
  const s = Math.min(1, Math.max(camera.s, minZoom), a.w / w);
  const h = Math.min(scene.heights[id] ?? 200, a.h / s);
  animateTo(a.l + a.w / 2 - (p.x + w / 2) * s, a.t + a.h / 2 - (p.y + h / 2) * s, s);
}

/** Fit the given cards, or the whole board. */
export function fit(ids?: string[]) {
  const all = Object.keys(scene.positions);
  const list = (ids ?? all).filter((id) => scene.positions[id]);
  if (!list.length) {
    // Nothing on the board yet: reset to full size, so the first card doesn't start tiny.
    if (!ids) animateTo(innerWidth / 2 - CARD_W / 2, innerHeight / 3, 1);
    return;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of list) {
    const p = scene.positions[id];
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y - 36); // The label above a card.
    x1 = Math.max(x1, p.x + scene.widthOf(id));
    y1 = Math.max(y1, p.y + (scene.heights[id] ?? 170));
  }
  const a = viewArea();
  const s = Math.max(MIN_ZOOM, Math.min(1, a.w / (x1 - x0), a.h / (y1 - y0)));
  animateTo(a.l + (a.w - (x1 - x0) * s) / 2 - x0 * s, a.t + (a.h - (y1 - y0) * s) / 2 - y0 * s, s);
}

/** Keep the card you're asking about in view along with the slot. If both won't fit, the slot wins. */
export function frameSlot(parentId: string) {
  const g = scene.positions[SLOT_ID];
  const par = scene.positions[parentId];
  if (!g || !par) return;
  const a = viewArea();
  const s = Math.min(1, Math.max(camera.s, SLOT_ZOOM), a.w / CARD_W);
  const pw = scene.widthOf(parentId);
  const ph = scene.heights[parentId] ?? 170;
  const gh = scene.slotHeight;
  const x0 = Math.min(g.x, par.x);
  const x1 = Math.max(g.x + CARD_W, par.x + pw);
  const y0 = Math.min(g.y, par.y - 36);
  const y1 = Math.max(g.y + gh, par.y + ph);
  const x = (x1 - x0) * s <= a.w ? a.l + (a.w - (x1 - x0) * s) / 2 - x0 * s : a.l + (a.w - CARD_W * s) / 2 - g.x * s;
  let y: number;
  if ((y1 - y0) * s <= a.h) y = a.t + (a.h - (y1 - y0) * s) / 2 - y0 * s;
  else if (g.y >= par.y) y = a.t + a.h - (g.y + gh) * s;
  else y = a.t - g.y * s;
  animateTo(x, y, s);
}

/* ---------- Coordinating store changes with layout ---------- */

let glideRequested = false;
const afterQueue: (() => void)[] = [];
let afterFallback = 0;

/** Make the next layout change slide cards into place instead of jumping. */
export function glideNext() {
  glideRequested = true;
}

export function consumeGlide() {
  const g = glideRequested;
  glideRequested = false;
  return g;
}

/** Run once the canvas has laid out the current state, for camera moves that need fresh positions. */
export function afterLayout(fn: () => void) {
  afterQueue.push(fn);
  // If the change didn't touch the canvas it won't re-render, so don't wait for it forever.
  cancelAnimationFrame(afterFallback);
  afterFallback = requestAnimationFrame(flushAfterLayout);
}

export function flushAfterLayout() {
  cancelAnimationFrame(afterFallback);
  afterQueue.splice(0).forEach((fn) => fn());
}

let relayoutFn: () => void = () => {};
export function setRelayout(fn: () => void) {
  relayoutFn = fn;
}
export const relayout = () => relayoutFn();

const placedSubs = new Set<() => void>();
export function subscribePlaced(fn: () => void) {
  placedSubs.add(fn);
  return () => void placedSubs.delete(fn);
}
export const notifyPlaced = () => placedSubs.forEach((fn) => fn());

let focusBarFn: () => void = () => {};
export function setFocusBar(fn: () => void) {
  focusBarFn = fn;
}
export const focusBar = () => focusBarFn();
