import type { Board } from "./types";
import { childrenOf, followupOf } from "./tree";

export const CARD_W = 440;
export const COL_GAP = 80;
export const ROW_GAP = 56;
const DEFAULT_H = 160;

export type Positions = Record<string, { x: number; y: number }>;

/**
 * "Threads go down, branches go right."
 *
 * Each column holds one thread: a turn and its chain of follow-ups. A branch
 * starts a thread in the next column over, aligned with the turn it came from,
 * or pushed down if that column is already occupied at that height (a per-column
 * skyline). Branch edges therefore only ever cross the gap between adjacent
 * columns, and cards can never overlap.
 *
 * Only visible turns get a position; collapsed turns hide everything below them.
 */
export function layoutBoard(board: Board, heights: Record<string, number>): Positions {
  const base: Positions = {};
  const bottom: number[] = [];
  const h = (id: string) => heights[id] ?? DEFAULT_H;

  const placeThread = (startId: string, col: number, y0: number) => {
    const thread: string[] = [];
    let y = Math.max(y0, (bottom[col] ?? -Infinity) + ROW_GAP);
    let cur = board.turns[startId];
    while (cur) {
      thread.push(cur.id);
      base[cur.id] = { x: col * (CARD_W + COL_GAP), y };
      y += h(cur.id) + ROW_GAP;
      if (board.collapsed[cur.id]) break;
      cur = followupOf(board, cur.id)!;
    }
    bottom[col] = y - ROW_GAP;

    for (const id of thread) {
      if (board.collapsed[id]) continue;
      for (const child of childrenOf(board, id)) {
        if (child.kind !== "followup") placeThread(child.id, col + 1, base[id].y);
      }
    }
  };

  placeThread(board.rootId, 0, 0);

  // Dragging a card moves its whole subtree, so offsets accumulate downward.
  const out: Positions = {};
  const apply = (id: string, ox: number, oy: number) => {
    if (!base[id]) return;
    const off = board.offsets[id];
    const x = ox + (off?.x ?? 0);
    const y = oy + (off?.y ?? 0);
    out[id] = { x: base[id].x + x, y: base[id].y + y };
    for (const c of childrenOf(board, id)) apply(c.id, x, y);
  };
  apply(board.rootId, 0, 0);
  return out;
}
