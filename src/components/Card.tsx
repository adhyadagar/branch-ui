"use client";

import { memo, useMemo, useState } from "react";
import type { Turn } from "@/lib/types";
import { parseAnswer } from "@/lib/answer";
import { stopTurn, submitTurn } from "@/lib/ask";
import { askIdea, beginAsk, deleteTurn, editTurn, openChat, resetCardSize, toggleCollapsed, toggleExpanded } from "@/lib/actions";
import { useStore } from "@/lib/store";
import { Markdown, Thinking } from "./Markdown";
import { MoreIcon, OpenIcon } from "./icons";

const KIND_LABEL = { root: "Topic", branch: "Branch", followup: "Follow-up" };

type Props = {
  turn: Turn;
  boardId: string;
  color: string;
  /** How many earlier cards the model sees. */
  sees: number;
  childCount: number;
  hasFollowup: boolean;
  /** Questions of existing children, one per line, to mark explored ideas. */
  childQuestions: string;
  hiddenCount: number;
  collapsed: boolean;
  expanded: boolean;
  width: number;
  height: number | null;
  selected: boolean;
  onPath: boolean;
  dimmed: boolean;
  menuOpen: boolean;
};

export const Card = memo(function Card(p: Props) {
  const { turn, boardId } = p;
  const [confirming, setConfirming] = useState(false);
  const { summary, body, ideas } = useMemo(() => parseAnswer(turn.answer), [turn.answer]);
  const sized = p.height !== null;
  const full = p.expanded || sized;
  const streaming = turn.status === "streaming";
  const explored = p.childQuestions.split("\n");

  let text;
  if (streaming && !body) {
    text = summary ? <p>{summary}</p> : <Thinking />;
  } else if (streaming || full) {
    text = <Markdown>{body}</Markdown>;
  } else {
    text = <p>{summary}</p>;
  }

  const toggleMenu = () => {
    setConfirming(false);
    useStore.setState({ menuId: p.menuOpen ? null : turn.id });
  };

  return (
    <article
      className={`card ${sized ? "sized" : ""} ${full ? "open-full" : ""} ${p.menuOpen ? "has-menu" : ""} ${p.selected ? "is-sel" : ""} ${p.onPath ? "on-path" : ""} ${p.dimmed ? "dim" : ""}`}
      data-item={turn.id}
      style={{ ["--c" as string]: p.color, width: p.width, height: p.height ?? undefined }}
    >
      <div className="pill">
        <span className="sq" />
        <span>{KIND_LABEL[turn.kind]}</span>
        {turn.kind !== "root" && <span className="sees">· sees {p.sees}</span>}
        <button onClick={() => openChat(turn.id)} title="Open as a conversation" aria-label="Open as a conversation">
          <OpenIcon />
        </button>
        <button onClick={toggleMenu} title="More actions" aria-label="More actions" aria-expanded={p.menuOpen}>
          <MoreIcon />
        </button>
        {p.menuOpen && (
          <div className="menu">
            {p.childCount > 0 && (
              <button onClick={() => toggleCollapsed(turn.id)}>{p.collapsed ? "Show what branches off" : "Hide what branches off"}</button>
            )}
            {p.childCount === 0 && !streaming && <button onClick={() => editTurn(turn.id)}>Edit question</button>}
            {sized && <button onClick={() => resetCardSize(turn.id)}>Reset card size</button>}
            {confirming ? (
              <button className="danger" onClick={() => deleteTurn(turn.id)}>
                Confirm delete
              </button>
            ) : (
              <button onClick={() => setConfirming(true)}>Delete card</button>
            )}
          </div>
        )}
      </div>

      <div className="c-body">
        {turn.quote && <blockquote className="quote">{turn.quote}</blockquote>}
        <h3 className="q">{turn.question}</h3>
        <div className={`txt ${streaming && !full ? "live" : ""}`} data-answer-of={turn.id}>
          {text}
        </div>
        {turn.status === "error" && <div className="c-error">{turn.error}</div>}
        {full && !streaming && ideas.length > 0 && (
          <div className="chips">
            {ideas.map((q) => {
              const done = explored.includes(q);
              return (
                <button key={q} className={`chip ${done ? "explored" : ""}`} onClick={() => askIdea(turn.id, q)} title={done ? "Go to this branch" : "Explore in a new branch"}>
                  <span className="arr">{done ? "✓" : "→"}</span>
                  <span>{q}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="c-foot">
        {streaming ? (
          <>
            <span className="status">Answering…</span>
            <button className="right" onClick={() => stopTurn(turn.id)}>
              Stop
            </button>
          </>
        ) : (
          <>
            {!p.hasFollowup && (
              <button onClick={() => beginAsk(turn.id, "follow")} title="Continue this thread">
                ↓ Follow up
              </button>
            )}
            <button onClick={() => beginAsk(turn.id, "branch")} title="Open a side question">
              → Branch
            </button>
            {turn.status === "error" && <button onClick={() => submitTurn(boardId, turn.id)}>Retry</button>}
            {p.collapsed ? (
              <button className="right" onClick={() => toggleCollapsed(turn.id)}>
                +{p.hiddenCount} hidden
              </button>
            ) : (
              !sized && (
                <button className="right" onClick={() => toggleExpanded(turn.id)}>
                  {p.expanded ? "Less" : ideas.length ? `More · ${ideas.length} ideas` : "More"}
                </button>
              )
            )}
          </>
        )}
      </div>

      <div className="far-title">
        <span>{turn.question}</span>
      </div>
      <div className="grip" data-grip={turn.id} aria-hidden="true" />
    </article>
  );
});
