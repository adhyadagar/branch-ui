import type { Board, Point, Turn, TurnKind } from "./types";
import { childrenOf } from "./tree";

export const CARD_W = 360;
export const COL_GAP = 96;
export const ROW_GAP = 72;
export const MIN_CARD = { w: 260, h: 130 };
export const NOTE_SIZE = 150;
export const SLOT_ID = "slot";
const DEFAULT_H = 170;
const MIND_GAP = 62;
const ROOT_GAP = 70;

export type Positions = Record<string, Point>;

/** The space held open where the next answer will land. */
export type Slot = { parentId: string; kind: Exclude<TurnKind, "root">; height: number };

type Item = Pick<Turn, "id" | "kind">;
type Grid = Record<string, { col: number; y: number }>;

export function widthOf(board: Board, id: string): number {
  const note = board.notes.find((n) => n.id === id);
  return note ? note.w : (board.sizes[id]?.w ?? CARD_W);
}

function kidsOf(board: Board, id: string, slot: Slot | null): Item[] {
  const kids: Item[] = childrenOf(board, id);
  return slot?.parentId === id ? [...kids, { id: SLOT_ID, kind: slot.kind }] : kids;
}

/** Widen each column to its widest card, so a resized card never overlaps its neighbors. */
function columnsToX(board: Board, grid: Grid): Positions {
  const widths: number[] = [];
  for (const id in grid) widths[grid[id].col] = Math.max(widths[grid[id].col] ?? 0, widthOf(board, id));
  const xs: number[] = [];
  let x = 0;
  for (let i = 0; i < widths.length; i++) {
    xs[i] = x;
    x += (widths[i] ?? CARD_W) + COL_GAP;
  }
  const out: Positions = {};
  for (const id in grid) out[id] = { x: xs[grid[id].col], y: grid[id].y };
  return out;
}

/**
 * "Threads go down, branches go right."
 *
 * Each column holds threads: a turn and its chain of follow-ups. A branch starts a
 * thread in the next column over, aligned with the turn it came from, or pushed down
 * if that column is occupied at that height (a per-column skyline). Branch lines only
 * ever cross the gap between adjacent columns, and cards can't overlap.
 */
function layoutThreads(board: Board, heights: Record<string, number>, slot: Slot | null): Positions {
  const grid: Grid = {};
  const bottom: number[] = [];
  const h = (id: string) => (id === SLOT_ID ? (slot?.height ?? DEFAULT_H) : (heights[id] ?? DEFAULT_H));
  const followup = (id: string) => kidsOf(board, id, slot).find((k) => k.kind === "followup");

  const place = (startId: string, col: number, y0: number) => {
    const thread: string[] = [];
    let y = Math.max(y0, (bottom[col] ?? -Infinity) + ROW_GAP);
    let cur: string | undefined = startId;
    while (cur) {
      thread.push(cur);
      grid[cur] = { col, y };
      y += h(cur) + ROW_GAP;
      if (board.collapsed[cur]) break;
      cur = followup(cur)?.id;
    }
    bottom[col] = y - ROW_GAP;
    for (const id of thread) {
      if (board.collapsed[id]) continue;
      for (const k of kidsOf(board, id, slot)) {
        if (k.kind !== "followup") place(k.id, col + 1, grid[id].y);
      }
    }
  };

  for (const root of board.rootIds) {
    const used = bottom.filter((v) => v !== undefined);
    place(root, 0, used.length ? Math.max(...used) + ROW_GAP + ROOT_GAP : 0);
  }
  return columnsToX(board, grid);
}

/** A classic left-to-right tree: depth is the column, and children stack beside their parent. */
function layoutMind(board: Board, heights: Record<string, number>, slot: Slot | null): Positions {
  const grid: Grid = {};
  const h = (id: string) => (id === SLOT_ID ? (slot?.height ?? DEFAULT_H) : (heights[id] ?? DEFAULT_H));
  const place = (id: string, col: number, top: number): number => {
    const kids = board.collapsed[id] ? [] : kidsOf(board, id, slot);
    if (!kids.length) {
      grid[id] = { col, y: top };
      return h(id);
    }
    let y = top;
    for (const k of kids) y += place(k.id, col + 1, y) + MIND_GAP;
    const span = y - MIND_GAP - top;
    grid[id] = { col, y: top + Math.max(0, (span - h(id)) / 2) };
    return Math.max(span, h(id));
  };
  let top = 0;
  for (const root of board.rootIds) top += place(root, 0, top) + MIND_GAP + ROOT_GAP;
  return columnsToX(board, grid);
}

export function layoutBoard(board: Board, heights: Record<string, number>, slot: Slot | null): Positions {
  const base = board.mode === "threads" ? layoutThreads(board, heights, slot) : layoutMind(board, heights, slot);
  const offsets = board.offsets[board.mode];
  const out: Positions = {};
  // Dragging a card carries what branches off it, so offsets accumulate down the tree.
  const apply = (id: string, ox: number, oy: number) => {
    if (!base[id]) return;
    const x = ox + (offsets[id]?.x ?? 0);
    const y = oy + (offsets[id]?.y ?? 0);
    out[id] = { x: base[id].x + x, y: base[id].y + y };
    for (const k of kidsOf(board, id, slot)) apply(k.id, x, y);
  };
  board.rootIds.forEach((r) => apply(r, 0, 0));
  for (const n of board.notes) out[n.id] = { x: n.x, y: n.y };
  return out;
}

type Box = Point & { w: number; h: number };

/** Curves between cards, choosing sides from where the cards actually are after dragging. */
export function edgePath(mode: Board["mode"], kind: TurnKind, a: Box, b: Box): string {
  const anchor = (h: number) => (mode === "mind" ? h / 2 : Math.min(h / 2, 48));
  if (mode === "threads" && kind === "followup" && b.y >= a.y + a.h - 8) {
    // Run right of center so the line clears the label above the next card.
    const sx = a.x + a.w * 0.75;
    const sy = a.y + a.h;
    const ex = b.x + b.w * 0.75;
    const ey = b.y;
    const d = Math.max(16, (ey - sy) / 2);
    return `M${sx} ${sy} C${sx} ${sy + d} ${ex} ${ey - d} ${ex} ${ey}`;
  }
  if (b.x >= a.x + a.w - 8) {
    const sx = a.x + a.w;
    const sy = a.y + anchor(a.h);
    const ex = b.x;
    const ey = b.y + anchor(b.h);
    const d = Math.max(36, (ex - sx) / 2);
    return `M${sx} ${sy} C${sx + d} ${sy} ${ex - d} ${ey} ${ex} ${ey}`;
  }
  if (b.x + b.w <= a.x + 8) {
    const sx = a.x;
    const sy = a.y + anchor(a.h);
    const ex = b.x + b.w;
    const ey = b.y + anchor(b.h);
    const d = Math.max(36, (sx - ex) / 2);
    return `M${sx} ${sy} C${sx - d} ${sy} ${ex + d} ${ey} ${ex} ${ey}`;
  }
  const down = b.y >= a.y;
  const sx = a.x + a.w / 2;
  const sy = down ? a.y + a.h : a.y;
  const ex = b.x + b.w / 2;
  const ey = down ? b.y : b.y + b.h;
  const d = Math.max(30, Math.abs(ey - sy) / 2) * (down ? 1 : -1);
  return `M${sx} ${sy} C${sx} ${sy + d} ${ex} ${ey - d} ${ex} ${ey}`;
}
