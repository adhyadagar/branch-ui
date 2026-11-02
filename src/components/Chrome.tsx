"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Board } from "@/lib/types";
import { useStore } from "@/lib/store";
import { addNote, deleteBoard, goToMainThread, hideToast, newBoard, setActiveBoard, setLayoutMode, tidyUp, togglePanel } from "@/lib/actions";
import { mutateActive } from "@/lib/store";
import { threadCount } from "@/lib/tree";
import { fit, getCamera, subscribeCamera, zoomFromCenter } from "@/lib/view";
import { ChevronIcon, HandIcon, ListIcon, Logo, NoteIcon, NotesIcon, PointerIcon, SparkleIcon } from "./icons";
import { KeyButton } from "./KeyDialog";

function countLabel(n: number) {
  if (!n) return "Empty";
  return n === 1 ? "1 thread" : `${n} threads`;
}

export function BoardPill({ board }: { board: Board }) {
  const boards = useStore((s) => s.boards);
  const [open, setOpen] = useState(false);
  const sorted = Object.values(boards).sort((a, b) => b.updatedAt - a.updatedAt);
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Undo keeps the menu open, so you can see the board come back.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!pillRef.current?.contains(target) && !target.closest(".toast")) setOpen(false);
    };
    // Captured, so closing the menu doesn't also deselect the card behind it.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    addEventListener("pointerdown", onPointerDown);
    addEventListener("keydown", onKeyDown, true);
    return () => {
      removeEventListener("pointerdown", onPointerDown);
      removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="float board-pill" ref={pillRef}>
      <Logo />
      <b>Branch</b>
      <input className="board-name" value={board.title} aria-label="Board name" onChange={(e) => mutateActive((b) => ({ ...b, title: e.target.value }))} />
      <div className="boards-anchor">
        <button className="ghost boards-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          Boards
          <ChevronIcon />
        </button>
        {open && (
          <div className="board-menu">
            <div className="board-list">
              {sorted.map((b) => (
                <div key={b.id} className={`board-row ${b.id === board.id ? "active" : ""}`}>
                  <button
                    className="board-open"
                    title={b.title}
                    onClick={() => {
                      setActiveBoard(b.id);
                      setOpen(false);
                    }}
                  >
                    {b.title || "Untitled board"}
                  </button>
                  <span className="count">{countLabel(threadCount(b))}</span>
                  <button className="board-del" title="Delete board" aria-label={`Delete ${b.title}`} onClick={() => deleteBoard(b.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <button
        className="ghost new-board"
        title="New board"
        aria-label="New board"
        onClick={() => {
          newBoard();
          setOpen(false);
        }}
      >
        +
      </button>
    </div>
  );
}

export function ViewPill({ board }: { board: Board }) {
  return (
    <div className="float view-pill">
      <KeyButton />
      <div className="seg" role="group" aria-label="Layout">
        <button aria-pressed={board.mode === "threads"} onClick={() => setLayoutMode("threads")}>
          Threads
        </button>
        <button aria-pressed={board.mode === "mind"} onClick={() => setLayoutMode("mind")}>
          Mind map
        </button>
      </div>
      <button className="ghost" onClick={goToMainThread}>
        ↩ Main thread
      </button>
      <button className="tidy" onClick={tidyUp} aria-label="Tidy up" title="Put every card back in a clean layout">
        <SparkleIcon />
        <span>Tidy up</span>
      </button>
    </div>
  );
}

export function Rail() {
  const tool = useStore((s) => s.tool);
  const threadsOpen = useStore((s) => s.threadsOpen);
  const panelTab = useStore((s) => s.panelTab);
  const button = (label: string, icon: ReactNode, pressed: boolean | undefined, onClick: () => void) => (
    <button title={label} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      {icon}
    </button>
  );
  return (
    <div className="float rail" role="toolbar" aria-label="Tools">
      {button("Select and move (V)", <PointerIcon />, tool === "select", () => useStore.setState({ tool: "select" }))}
      {button("Pan the board (H)", <HandIcon />, tool === "hand", () => useStore.setState({ tool: "hand" }))}
      {button("Add a note to the board (N)", <NoteIcon />, undefined, addNote)}
      {button("Threads and search (⌘K)", <ListIcon />, threadsOpen && panelTab === "threads", () => togglePanel("threads"))}
      {button("Your highlights and notes", <NotesIcon />, threadsOpen && panelTab === "notes", () => togglePanel("notes"))}
    </div>
  );
}

export function ZoomPill() {
  const valueRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const update = () => {
      if (valueRef.current) valueRef.current.textContent = `${Math.round(getCamera().s * 100)}%`;
    };
    update();
    return subscribeCamera(update);
  }, []);
  return (
    <div className="float zoom">
      <button id="fitBtn" onClick={() => fit()}>
        Fit all
      </button>
      <button aria-label="Zoom out" onClick={() => zoomFromCenter(1 / 1.2)}>
        −
      </button>
      <span className="zoom-val" ref={valueRef} />
      <button aria-label="Zoom in" onClick={() => zoomFromCenter(1.2)}>
        +
      </button>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      {toast.text}
      {toast.undo && (
        <button
          onClick={() => {
            toast.undo?.();
            hideToast();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
