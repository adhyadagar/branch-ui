"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Board, Turn } from "@/lib/types";
import { useStore } from "@/lib/store";
import { askIdea, closeChat, openChat } from "@/lib/actions";
import { parseAnswer } from "@/lib/answer";
import { stopTurn, submitTurn } from "@/lib/ask";
import { chainThrough, childrenOf, pathTo, shortLabel } from "@/lib/tree";
import { threadColors } from "@/lib/colors";
import { Markdown, Thinking } from "./Markdown";
import { NoteButton, NoteTab } from "./Notes";

const NEAR_BOTTOM = 240;

function Message({ board, turn, nextId, colors }: { board: Board; turn: Turn; nextId?: string; colors: Record<string, string> }) {
  const { body, ideas } = useMemo(() => parseAnswer(turn.answer), [turn.answer]);
  const kids = childrenOf(board, turn.id);
  const forks = kids.filter((k) => k.id !== nextId);
  const open = turn.status === "done" ? ideas.filter((q) => !kids.some((k) => k.question === q)) : [];
  let label = "";
  if (forks.length) label = `${forks.length === 1 ? "1 other branch" : `${forks.length} other branches`} from here${open.length ? ", plus ideas to explore" : ""}`;
  else if (open.length) label = "Ideas to explore";

  return (
    <>
      <div className="m-user" data-msg={turn.id}>
        {turn.quote && <blockquote>{turn.quote}</blockquote>}
        {turn.question}
      </div>
      <div className="m-ai" style={{ ["--c" as string]: colors[turn.id] }} data-answer-of={turn.id}>
        {body ? <Markdown>{body}</Markdown> : turn.status === "streaming" ? <Thinking /> : null}
      </div>
      {turn.status === "error" && (
        <div className="c-error">
          {turn.error} <button onClick={() => submitTurn(board.id, turn.id)}>Retry</button>
        </div>
      )}
      {turn.status === "streaming" && (
        <div>
          <button className="m-stop" onClick={() => stopTurn(turn.id)}>
            Stop
          </button>
        </div>
      )}
      {turn.status !== "streaming" && (
        <div className="m-notes">
          <NoteButton className="m-stop" turnId={turn.id} />
          <NoteTab turnId={turn.id} count={board.annotations.filter((a) => a.turnId === turn.id && a.text.trim()).length} />
        </div>
      )}
      {label && (
        <div className="forks">
          <div className="f-label">{label}</div>
          {forks.map((k) => (
            <button key={k.id} className="chip" style={{ ["--c" as string]: colors[k.id] }} onClick={() => openChat(k.id)}>
              <span className="arr">↳</span>
              <span>{shortLabel(k.question, 48)}</span>
            </button>
          ))}
          {open.map((q) => (
            <button key={q} className="chip" onClick={() => askIdea(turn.id, q)}>
              <span className="arr">→</span>
              <span>{q}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** A path through the board as a normal linear conversation. */
export function ChatView({ board }: { board: Board }) {
  const chatId = useStore((s) => s.chatId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turn = chatId ? board.turns[chatId] : undefined;

  const openedId = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !chatId || openedId.current === chatId) {
      if (!chatId) openedId.current = null;
      return;
    }
    openedId.current = chatId;
    const target = el.querySelector(`[data-msg="${chatId}"]`);
    const continues = chainThrough(board, chatId).at(-1)?.id !== chatId;
    if (target && continues) target.scrollIntoView({ block: "start" });
    else el.scrollTop = el.scrollHeight;
  }, [chatId, board]);

  // Follow a streaming answer, unless the reader has scrolled up.
  const streamed = turn ? chainThrough(board, turn.id).reduce((n, t) => n + t.answer.length, 0) : 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM) el.scrollTop = el.scrollHeight;
  }, [streamed]);

  if (!turn) return null;
  const chain = chainThrough(board, turn.id);
  const colors = threadColors(board);

  return (
    <div className="focus">
      <div className="f-head">
        <button className="back" onClick={closeChat}>
          ← Back to board
        </button>
        <div className="crumbs">
          {pathTo(board, turn.id).map((t, i) => (
            <span key={t.id} className="crumb">
              {i > 0 && <span className="sep">›</span>}
              <span className="c">{shortLabel(t.question, 30)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="f-scroll" ref={scrollRef}>
        <div className="f-col">
          {chain.map((t, i) => (
            <Message key={t.id} board={board} turn={t} nextId={chain[i + 1]?.id} colors={colors} />
          ))}
        </div>
      </div>
    </div>
  );
}
