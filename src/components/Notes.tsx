"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import type { Board } from "@/lib/types";
import { useStore } from "@/lib/store";
import { addAnnotation, closeNotes, deleteAnnotation, openNotes, setAnnotationText } from "@/lib/actions";
import { annotationAt, paintAnnotations, whenWritten } from "@/lib/annotations";
import { shortLabel } from "@/lib/tree";
import { subscribeCamera } from "@/lib/view";

const GAP = 8;
const BUTTON_H = 30; // Roughly what the popover opens below, for when it has to flip above it.

export function NoteButton({ turnId, className }: { turnId: string; className?: string }) {
  return (
    <button
      className={className}
      title="Write a note on this card"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        addAnnotation(turnId, r.left, r.bottom);
      }}
    >
      Note
    </button>
  );
}

/** A note stuck to a card: a little of it shows, so you can see it's there, and clicking opens it. */
export function NoteTab({ turnId, count }: { turnId: string; count: number }) {
  if (!count) return null;
  const label = count === 1 ? "1 note on this card" : `${count} notes on this card`;
  return (
    <button
      className="note-tab"
      title={label}
      aria-label={label}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        openNotes(turnId, r.left, r.bottom);
      }}
    >
      {count}
    </button>
  );
}

/** A small box beside the text, not a dialog over it, so you stay where you were on the board. */
function Popover({ board }: { board: Board }) {
  const pop = useStore((s) => s.notePop)!;
  const ref = useRef<HTMLDivElement>(null);
  const turn = board.turns[pop.turnId];
  // Fixed when it opens, so a note you're rewriting doesn't vanish the moment it's empty.
  const [written] = useState(() => new Set(board.annotations.filter((a) => a.turnId === pop.turnId && a.text.trim()).map((a) => a.id)));
  const notes = board.annotations.filter((a) => (pop.onlyId ? a.id === pop.onlyId : written.has(a.id)));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    let y = pop.y + GAP;
    if (y + h > innerHeight - GAP) y = Math.max(GAP, pop.y - BUTTON_H - h - GAP);
    el.style.left = `${Math.max(GAP, Math.min(innerWidth - w - GAP, pop.x))}px`;
    el.style.top = `${y}px`;
    const boxes = el.querySelectorAll("textarea");
    boxes[boxes.length - 1]?.focus();
    // Only when it opens, so it doesn't jump around as you type.
  }, [pop]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeNotes();
    };
    addEventListener("pointerdown", onDown);
    // It sits at a fixed spot on screen, so it would be left behind when the board moves.
    const offCamera = subscribeCamera(closeNotes);
    return () => {
      removeEventListener("pointerdown", onDown);
      offCamera();
    };
  }, []);

  if (!turn) return null;

  return (
    <div
      className="note-pop"
      ref={ref}
      role="dialog"
      aria-label="Your note"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          closeNotes();
        }
      }}
    >
      <div className="np-list">
        {notes.map((note) => {
          const remove = note.text.trim() ? "Delete this note" : "Remove this highlight";
          return (
            <div className="np-note" key={note.id}>
              <div className="np-head">
                <b>{note.text.trim() || !note.quote ? "Note" : "Highlight"}</b>
                <span>{whenWritten(note.createdAt)}</span>
                <button className="x" onClick={() => deleteAnnotation(note.id)} title={remove} aria-label={remove}>
                  ✕
                </button>
              </div>
              {note.quote && <p className="np-quote">{shortLabel(note.quote, 160)}</p>}
              <textarea rows={3} value={note.text} placeholder={note.quote ? "Add a note…" : "Write anything…"} aria-label="Your note" onChange={(e) => setAnnotationText(note.id, e.target.value)} />
            </div>
          );
        })}
      </div>
      <div className="np-foot">
        {!pop.onlyId && <button onClick={() => addAnnotation(pop.turnId, pop.x, pop.y)}>+ Add another</button>}
        <span>Saves as you type</span>
        <button className="np-done" onClick={closeNotes}>
          Done
        </button>
      </div>
    </div>
  );
}

/** Highlights the noted passages wherever they're on screen, and opens a note from its dot or highlight. */
export function NoteLayer({ board }: { board: Board }) {
  const pop = useStore((s) => s.notePop);
  // Both change which passages are rendered, and neither passes through the board.
  useStore((s) => s.expanded);
  useStore((s) => s.chatId);

  useLayoutEffect(() => paintAnnotations(board));

  useEffect(() => {
    const onClick = (e: globalThis.MouseEvent) => {
      const target = e.target as Element;
      const answer = target.closest?.<HTMLElement>("[data-answer-of]");
      if (!answer) return;
      const dot = target.closest<HTMLElement>(".note-dot");
      if (dot) {
        const r = dot.getBoundingClientRect();
        return openNotes(answer.dataset.answerOf!, r.left, r.bottom, dot.dataset.noteId);
      }
      if (target.closest("a, button") || getSelection()?.toString().trim()) return;
      const id = annotationAt(answer, e.clientX, e.clientY);
      if (id) openNotes(answer.dataset.answerOf!, e.clientX, e.clientY + GAP, id);
    };
    addEventListener("click", onClick);
    return () => removeEventListener("click", onClick);
  }, []);

  return pop ? <Popover key={`${pop.turnId}:${pop.onlyId}`} board={board} /> : null;
}
