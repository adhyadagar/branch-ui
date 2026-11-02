import type { Board } from "./types";
import { childrenOf } from "./tree";

// The first thread is plain ink; color only appears once you branch away from it.
const PALETTE = ["var(--ink)", "#c2536b", "#2a8a84", "#c0842a", "#5563d6", "#8f55a8", "#5f8f3e"];

export const NOTE_COLORS = ["#f6e3b4", "#f4d4d6", "#d5e8d4", "#d4e6ef", "#e4daf0", "#f6d9c2"];

/** Every turn in a thread shares its thread's color; each branch starts a new color. */
export function threadColors(board: Board): Record<string, string> {
  const out: Record<string, string> = {};
  let next = -1;
  const visit = (id: string, color: string) => {
    out[id] = color;
    for (const c of childrenOf(board, id)) {
      visit(c.id, c.kind === "followup" ? color : PALETTE[++next % PALETTE.length]);
    }
  };
  board.rootIds.forEach((r) => visit(r, PALETTE[++next % PALETTE.length]));
  return out;
}
