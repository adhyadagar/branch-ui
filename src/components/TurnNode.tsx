"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Turn } from "@/lib/types";
import { useStore } from "@/lib/store";
import { stopTurn, submitTurn } from "@/lib/ask";
import { CARD_W } from "@/lib/layout";

export type TurnNodeData = {
  turn: Turn;
  boardId: string;
  color: string;
  hasFollowup: boolean;
  childCount: number;
  hiddenCount: number;
  collapsed: boolean;
  onPath: boolean;
  dimmed: boolean;
  /** Questions of existing children, to mark branch ideas already explored. */
  childQuestions: Record<string, string>;
};

export type TurnFlowNode = Node<TurnNodeData, "turn">;

const QUOTE_PROMPTS = ["Explain this more simply", "Give me a concrete example", "Why is this true?"];
const STARTERS = [
  "Explain how transformers work, from first principles",
  "Brainstorm names for a cozy bookshop café",
  "Help me plan a 2-week trip to Japan",
];

/** Pulls the trailing "Branch ideas" list out of an answer so it can render as chips. */
function splitIdeas(answer: string): { body: string; ideas: string[] } {
  const m = answer.match(/\n[#*\s]*Branch ideas[*:\s]*\n/i);
  if (!m || m.index === undefined) return { body: answer, ideas: [] };
  const ideas = answer
    .slice(m.index + m[0].length)
    .split("\n")
    .map((l) => l.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)?.[1].trim())
    .filter((s): s is string => !!s)
    .map((s) => s.replace(/^\*\*(.*)\*\*$/, "$1"));
  return { body: answer.slice(0, m.index), ideas };
}

function TurnNodeImpl({ data, selected }: NodeProps<TurnFlowNode>) {
  const { turn, boardId, color } = data;
  const addDraft = useStore((s) => s.addDraft);
  const updateTurn = useStore((s) => s.updateTurn);
  const removeTurn = useStore((s) => s.removeTurn);
  const toggleCollapsed = useStore((s) => s.toggleCollapsed);
  const focusOn = useStore((s) => s.focusOn);

  const isDraft = turn.status === "draft";
  const isRoot = turn.kind === "root";
  const { body, ideas } = splitIdeas(turn.answer);

  const askChild = (question: string, kind: "followup" | "branch" = "branch") => {
    const existing = Object.entries(data.childQuestions).find(([, q]) => q === question)?.[0];
    if (existing) return focusOn(existing);
    const id = addDraft(turn.id, kind);
    updateTurn(boardId, id, { question });
    submitTurn(boardId, id);
  };

  const remove = () => {
    if (data.childCount > 0 && !confirm("Delete this card and everything branching from it?")) return;
    removeTurn(turn.id);
  };

  const kindLabel = isRoot ? "Topic" : turn.kind === "branch" ? "Branch" : "Follow-up";

  return (
    <div
      className={`turn-card group ${selected ? "is-selected" : ""} ${data.onPath ? "is-on-path" : ""} ${data.dimmed ? "is-dimmed" : ""}`}
      style={{ width: CARD_W, ["--thread" as string]: color }}
    >
      <Handle type="target" position={Position.Top} id="t" className="turn-handle" />
      <Handle type="target" position={Position.Left} id="l" className="turn-handle" />

      <div className="flex items-center gap-2 px-4 pt-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span>{kindLabel}</span>
        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 nodrag">
          {data.childCount > 0 && (
            <button className="icon-btn" onClick={() => toggleCollapsed(turn.id)} title="Collapse / expand">
              {data.collapsed ? "Expand" : "Collapse"}
            </button>
          )}
          {!isDraft && data.childCount === 0 && turn.status !== "streaming" && (
            <button
              className="icon-btn"
              title="Edit question"
              onClick={() => updateTurn(boardId, turn.id, { status: "draft", answer: "", error: undefined })}
            >
              Edit
            </button>
          )}
          {!(isRoot && isDraft) && (
            <button className="icon-btn" onClick={remove} title="Delete">
              Delete
            </button>
          )}
        </div>
      </div>

      {turn.quote && (
        <blockquote className="mx-4 mt-2 line-clamp-4 border-l-2 pl-3 text-[13px] italic text-[var(--muted)]" style={{ borderColor: color }}>
          {turn.quote}
        </blockquote>
      )}

      {isDraft ? (
        <Composer turn={turn} boardId={boardId} autoFocus={selected} />
      ) : (
        <div className="px-4 pt-2 text-[15px] font-semibold leading-snug text-[var(--fg)]">{turn.question}</div>
      )}

      {isDraft && turn.quote && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3 nodrag">
          {QUOTE_PROMPTS.map((p) => (
            <button
              key={p}
              className="chip"
              onClick={() => {
                updateTurn(boardId, turn.id, { question: p });
                submitTurn(boardId, turn.id);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {isDraft && isRoot && (
        <div className="flex flex-col gap-1.5 px-4 pb-4 nodrag">
          <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Try</div>
          {STARTERS.map((p) => (
            <button
              key={p}
              className="chip text-left"
              onClick={() => {
                updateTurn(boardId, turn.id, { question: p });
                submitTurn(boardId, turn.id);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {!isDraft && (
        <div
          className="md nodrag nowheel nopan mx-4 mt-2 max-h-[460px] cursor-text overflow-y-auto pb-1 select-text"
          data-answer-of={turn.id}
        >
          {body ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          ) : turn.status === "streaming" ? (
            <div className="thinking">
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>
      )}

      {turn.status === "error" && (
        <div className="mx-4 mt-2 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-[13px] text-[var(--danger)]">
          {turn.error}
        </div>
      )}

      {ideas.length > 0 && turn.status === "done" && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2 nodrag">
          {ideas.map((idea) => {
            const explored = Object.values(data.childQuestions).includes(idea);
            return (
              <button
                key={idea}
                className={`chip ${explored ? "is-explored" : ""}`}
                onClick={() => askChild(idea)}
                title={explored ? "Go to this branch" : "Explore in a new branch"}
              >
                <span className="text-[var(--thread)]">{explored ? "✓" : "→"}</span> {idea}
              </button>
            );
          })}
        </div>
      )}

      {!isDraft && (
        <div className="flex items-center gap-1 px-3 pb-3 pt-3 nodrag">
          {turn.status === "streaming" ? (
            <button className="action-btn" onClick={() => stopTurn(turn.id)}>
              Stop
            </button>
          ) : (
            <>
              {!data.hasFollowup && (
                <button className="action-btn" onClick={() => addDraft(turn.id, "followup")} title="Continue this thread (below)">
                  ↓ Follow up
                </button>
              )}
              <button className="action-btn" onClick={() => addDraft(turn.id, "branch")} title="Open a side branch (right)">
                → Branch
              </button>
              {turn.status === "error" && (
                <button className="action-btn" onClick={() => submitTurn(boardId, turn.id)}>
                  Retry
                </button>
              )}
              {data.hiddenCount > 0 && (
                <button className="action-btn ml-auto" onClick={() => toggleCollapsed(turn.id)}>
                  +{data.hiddenCount} hidden
                </button>
              )}
            </>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} id="b" className="turn-handle" />
      <Handle type="source" position={Position.Right} id="r" className="turn-handle" />
    </div>
  );
}

function Composer({ turn, boardId, autoFocus }: { turn: Turn; boardId: string; autoFocus: boolean }) {
  const [text, setText] = useState(turn.question);
  const ref = useRef<HTMLTextAreaElement>(null);
  const updateTurn = useStore((s) => s.updateTurn);
  const removeTurn = useStore((s) => s.removeTurn);

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const submit = () => {
    if (!text.trim()) return;
    updateTurn(boardId, turn.id, { question: text.trim() });
    submitTurn(boardId, turn.id);
  };

  const placeholder =
    turn.kind === "root"
      ? "What do you want to explore?"
      : turn.quote
        ? "Ask about this passage…"
        : turn.kind === "branch"
          ? "Ask a side question…"
          : "Continue the thread…";

  return (
    <div className="px-4 pb-3 pt-2 nodrag">
      <textarea
        ref={ref}
        value={text}
        rows={turn.kind === "root" ? 3 : 2}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape" && turn.kind !== "root") {
            removeTurn(turn.id);
          }
        }}
        className="composer"
      />
      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span>Enter to ask · Shift+Enter for newline{turn.kind !== "root" && " · Esc to discard"}</span>
        <button className="send-btn" onClick={submit} disabled={!text.trim()}>
          Ask
        </button>
      </div>
    </div>
  );
}

export const TurnNode = memo(TurnNodeImpl);
