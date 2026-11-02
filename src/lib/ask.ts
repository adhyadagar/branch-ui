"use client";

import type { Turn } from "./types";
import { pathTo } from "./tree";
import { useStore } from "./store";
import { ERROR_SENTINEL } from "./protocol";

type Message = { role: "user" | "assistant"; content: string };

function userContent(turn: Turn): string {
  if (!turn.quote) return turn.question;
  const quoted = turn.quote
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `About this part of your previous answer:\n\n${quoted}\n\n${turn.question}`;
}

/**
 * The model only sees the path from the root to this card. Sibling branches
 * are invisible to it, which is what keeps a tangent from polluting the thread.
 */
export function contextFor(path: Turn[]): Message[] {
  const messages: Message[] = [];
  for (const t of path) {
    messages.push({ role: "user", content: userContent(t) });
    if (t.answer && t !== path[path.length - 1]) messages.push({ role: "assistant", content: t.answer });
  }
  return messages;
}

const controllers = new Map<string, AbortController>();

export function stopTurn(id: string) {
  controllers.get(id)?.abort();
}

export async function submitTurn(boardId: string, id: string) {
  const { boards, updateTurn } = useStore.getState();
  const board = boards[boardId];
  const turn = board?.turns[id];
  if (!turn || !turn.question.trim() || controllers.has(id)) return;

  const path = pathTo(board, id);
  const branchDepth = path.filter((t) => t.kind === "branch").length;
  updateTurn(boardId, id, { status: "streaming", answer: "", error: undefined });

  const controller = new AbortController();
  controllers.set(id, controller);

  let answer = "";
  let flushed = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Batch token updates so persisting to localStorage doesn't run per token.
  const flush = () => {
    timer = null;
    if (answer.length !== flushed) {
      flushed = answer.length;
      updateTurn(boardId, id, { answer });
    }
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: contextFor(path), isBranch: turn.kind === "branch", branchDepth }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error((await res.text()) || `Request failed (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
      const errAt = answer.indexOf(ERROR_SENTINEL);
      if (errAt !== -1) {
        const message = answer.slice(errAt + ERROR_SENTINEL.length);
        answer = answer.slice(0, errAt);
        throw new Error(message);
      }
      if (!timer) timer = setTimeout(flush, 50);
    }
    if (timer) clearTimeout(timer);
    updateTurn(boardId, id, { answer, status: "done" });
  } catch (err) {
    if (timer) clearTimeout(timer);
    const aborted = controller.signal.aborted;
    updateTurn(boardId, id, {
      answer,
      status: aborted && answer ? "done" : "error",
      error: aborted ? "Stopped." : err instanceof Error ? err.message : String(err),
    });
  } finally {
    controllers.delete(id);
  }
}
