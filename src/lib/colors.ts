import type { Board } from "./types";
import { childrenOf } from "./tree";

const PALETTE = ["#5b5bd6", "#0d9488", "#d97706", "#e5484d", "#8e4ec6", "#0284c7", "#30a46c", "#d6409f"];

/** Every turn in a thread shares its thread's color; each branch starts a new color. */
export function threadColors(board: Board): Record<string, string> {
  const out: Record<string, string> = {};
  let next = 0;
  const visit = (id: string, color: string) => {
    out[id] = color;
    for (const c of childrenOf(board, id)) {
      visit(c.id, c.kind === "followup" ? color : PALETTE[++next % PALETTE.length]);
    }
  };
  if (board.turns[board.rootId]) visit(board.rootId, PALETTE[0]);
  return out;
}
