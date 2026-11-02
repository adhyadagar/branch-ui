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

/** A turn and its chain of follow-ups. */
export function threadFrom(board: Board, id: string): Turn[] {
  const out: Turn[] = [];
  let cur: Turn | undefined = board.turns[id];
  while (cur) {
    out.push(cur);
    cur = followupOf(board, cur.id);
  }
  return out;
}

/** A thread starts at a topic or a branch and runs down its follow-ups. */
export type Thread = { start: Turn; cards: Turn[]; depth: number };

/** Every thread on the board, each one followed by the branches that leave it. */
export function listThreads(board: Board): Thread[] {
  const out: Thread[] = [];
  const visit = (id: string, depth: number) => {
    const cards = threadFrom(board, id);
    if (!cards.length) return;
    out.push({ start: cards[0], cards, depth });
    for (const card of cards) for (const k of childrenOf(board, card.id)) if (k.kind !== "followup") visit(k.id, depth + 1);
  };
  board.rootIds.forEach((r) => visit(r, 0));
  return out;
}

export function threadCount(board: Board): number {
  return Object.values(board.turns).filter((t) => t.kind !== "followup").length;
}

/** What the conversation view shows: the path down to a card, then the rest of its thread. */
export function chainThrough(board: Board, id: string): Turn[] {
  return [...pathTo(board, id), ...threadFrom(board, id).slice(1)];
}

/** Cards currently on the board, skipping everything under a collapsed card. */
export function visibleTurns(board: Board): Turn[] {
  const out: Turn[] = [];
  const walk = (id: string) => {
    const t = board.turns[id];
    if (!t) return;
    out.push(t);
    if (!board.collapsed[id]) childrenOf(board, id).forEach((c) => walk(c.id));
  };
  board.rootIds.forEach(walk);
  return out;
}

export function shortLabel(text: string, max = 58): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}
