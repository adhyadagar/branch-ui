import type { Board, Turn } from "./types";

export function childrenOf(board: Board, id: string): Turn[] {
  return Object.values(board.turns)
    .filter((t) => t.parentId === id)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function followupOf(board: Board, id: string): Turn | undefined {
  return childrenOf(board, id).find((t) => t.kind === "followup");
}

/** Root → id, inclusive. */
export function pathTo(board: Board, id: string): Turn[] {
  const path: Turn[] = [];
  let cur: Turn | undefined = board.turns[id];
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? board.turns[cur.parentId] : undefined;
  }
  return path;
}

export function descendantIds(board: Board, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of childrenOf(board, cur)) {
      out.push(c.id);
      stack.push(c.id);
    }
  }
  return out;
}

/** The root's thread: root plus its chain of follow-ups. */
export function mainThread(board: Board): Turn[] {
  const out: Turn[] = [];
  let cur: Turn | undefined = board.turns[board.rootId];
  while (cur) {
    out.push(cur);
    cur = followupOf(board, cur.id);
  }
  return out;
}

export function shortLabel(turn: Turn, max = 60): string {
  const text = turn.question.trim() || (turn.quote ? `“${turn.quote}”` : "");
  if (!text) return turn.kind === "root" ? "New topic" : "Draft";
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}
