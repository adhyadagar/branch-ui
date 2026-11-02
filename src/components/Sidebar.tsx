"use client";

import { useMemo } from "react";
import type { Board, Turn } from "@/lib/types";
import { useStore } from "@/lib/store";
import { childrenOf, followupOf, shortLabel } from "@/lib/tree";
import { threadColors } from "@/lib/colors";

export function Sidebar({ board }: { board: Board }) {
  const boards = useStore((s) => s.boards);
  const { newBoard, setActiveBoard, deleteBoard, renameBoard } = useStore.getState();
  const sorted = Object.values(boards).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className="sidebar">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">Branch</span>
        <button className="toolbar-btn ml-auto" onClick={newBoard}>
          + New board
        </button>
      </div>

      <input
        className="board-title"
        value={board.title}
        onChange={(e) => renameBoard(board.id, e.target.value)}
        aria-label="Board title"
      />

      <div className="section-label">Outline</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Outline board={board} />
      </div>

      <div className="section-label">Boards</div>
      <div className="max-h-[32%] overflow-y-auto px-2 pb-3">
        {sorted.map((b) => (
          <div key={b.id} className={`board-row group ${b.id === board.id ? "is-active" : ""}`}>
            <button className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveBoard(b.id)}>
              {b.title || "Untitled board"}
            </button>
            <span className="text-[11px] text-[var(--muted)]">{Object.keys(b.turns).length}</span>
            <button
              className="icon-btn opacity-0 group-hover:opacity-100"
              title="Delete board"
              onClick={() => confirm(`Delete “${b.title}”?`) && deleteBoard(b.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

/** Threads as groups; each branch nests one level under the turn it came from. */
function Outline({ board }: { board: Board }) {
  const selectedId = useStore((s) => s.selectedId);
  const focusOn = useStore((s) => s.focusOn);
  const colors = useMemo(() => threadColors(board), [board]);

  const renderThread = (startId: string, depth: number): React.ReactNode[] => {
    const rows: React.ReactNode[] = [];
    let cur: Turn | undefined = board.turns[startId];
    while (cur) {
      const t: Turn = cur;
      rows.push(
        <button
          key={t.id}
          className={`outline-row ${t.id === selectedId ? "is-active" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => focusOn(t.id)}
          title={t.question}
        >
          <span
            className={`outline-dot ${t.status === "streaming" ? "is-streaming" : ""}`}
            style={{ background: t.kind === "followup" ? "transparent" : colors[t.id], borderColor: colors[t.id] }}
          />
          <span className={`truncate ${t.status === "draft" ? "italic text-[var(--muted)]" : ""}`}>
            {shortLabel(t, 80)}
          </span>
        </button>,
      );
      for (const c of childrenOf(board, t.id)) {
        if (c.kind !== "followup") rows.push(...renderThread(c.id, depth + 1));
      }
      cur = followupOf(board, t.id);
    }
    return rows;
  };

  return <>{renderThread(board.rootId, 0)}</>;
}

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="5" cy="4" r="2.2" fill="#5b5bd6" />
      <circle cx="5" cy="16" r="2.2" fill="#5b5bd6" />
      <circle cx="15" cy="9" r="2.2" fill="#0d9488" />
      <path d="M5 6.2v7.6M6.8 5.2C10 6 12 7 13 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}
