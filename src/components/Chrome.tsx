"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Board } from "@/lib/types";
import { useStore } from "@/lib/store";
import { addExampleBoard, addNote, closeThreads, deleteBoard, goToMainThread, hideToast, newBoard, openThreads, setActiveBoard, setLayoutMode, tidyUp } from "@/lib/actions";
import { mutateActive } from "@/lib/store";
import { threadCount } from "@/lib/tree";
import { fit, getCamera, subscribeCamera, zoomFromCenter } from "@/lib/view";
import { HandIcon, ListIcon, Logo, NoteIcon, PointerIcon, SparkleIcon } from "./icons";

function countLabel(n: number) {
  if (!n) return "Empty";
  return n === 1 ? "1 thread" : `${n} threads`;
}

export function BoardPill({ board }: { board: Board }) {
  const boards = useStore((s) => s.boards);
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const sorted = Object.values(boards).sort((a, b) => b.updatedAt - a.updatedAt);
  const close = () => {
    setOpen(false);
    setConfirmId(null);
  };

  return (
    <div className="float board-pill">
      <Logo />
      <b>Branch</b>
      <input className="board-name" value={board.title} aria-label="Board name" onChange={(e) => mutateActive((b) => ({ ...b, title: e.target.value }))} />
      <button className="ghost" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        Boards
      </button>
      <button
        className="ghost new-board"
        title="New board"
        aria-label="New board"
        onClick={() => {
          newBoard();
          close();
        }}
      >
        +
      </button>
      {open && (
        <div className="board-menu">
          <div className="board-list">
            {sorted.map((b) => (
              <div key={b.id} className={`board-row ${b.id === board.id ? "active" : ""}`}>
                <button
                  className="board-open"
                  onClick={() => {
                    setActiveBoard(b.id);
                    close();
                  }}
                >
                  {b.title || "Untitled board"}
                </button>
                <span className="count">{countLabel(threadCount(b))}</span>
                {confirmId === b.id ? (
                  <button
                    className="danger"
                    onClick={() => {
                      deleteBoard(b.id);
                      setConfirmId(null);
                    }}
                  >
                    Confirm
                  </button>
                ) : (
                  <button className="board-del" aria-label={`Delete ${b.title}`} onClick={() => setConfirmId(b.id)}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="board-actions">
            <button
              onClick={() => {
                newBoard();
                close();
              }}
            >
              + New board
            </button>
            <button
              onClick={() => {
                addExampleBoard();
                close();
              }}
            >
              Add example board
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ViewPill({ board }: { board: Board }) {
  return (
    <div className="float view-pill">
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
      <button className="tidy" onClick={tidyUp} title="Put every card back in a clean layout">
        <SparkleIcon />
        Tidy up
      </button>
    </div>
  );
}

export function Rail() {
  const tool = useStore((s) => s.tool);
  const threadsOpen = useStore((s) => s.threadsOpen);
  const button = (label: string, icon: ReactNode, pressed: boolean | undefined, onClick: () => void) => (
    <button title={label} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      {icon}
    </button>
  );
  return (
    <div className="float rail" role="toolbar" aria-label="Tools">
      {button("Select and move (V)", <PointerIcon />, tool === "select", () => useStore.setState({ tool: "select" }))}
      {button("Pan the board (H)", <HandIcon />, tool === "hand", () => useStore.setState({ tool: "hand" }))}
      {button("Add a sticky note (N)", <NoteIcon />, undefined, addNote)}
      {button("Threads and search (⌘K)", <ListIcon />, threadsOpen, () => (threadsOpen ? closeThreads() : openThreads()))}
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
