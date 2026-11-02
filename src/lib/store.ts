"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { Board, Turn, TurnKind } from "./types";
import { childrenOf, descendantIds, followupOf, shortLabel } from "./tree";

type State = {
  boards: Record<string, Board>;
  activeBoardId: string | null;

  // UI state, not persisted.
  heights: Record<string, number>;
  selectedId: string | null;
  /** Bumped to ask the canvas to fly the camera to a card. */
  focus: { id: string; nonce: number } | null;

  newBoard: () => string;
  deleteBoard: (id: string) => void;
  setActiveBoard: (id: string) => void;
  renameBoard: (id: string, title: string) => void;

  addDraft: (parentId: string, kind: Exclude<TurnKind, "root">, quote?: string) => string;
  updateTurn: (boardId: string, id: string, patch: Partial<Turn>) => void;
  /** Removes a turn and everything under it. The root is reset instead. */
  removeTurn: (id: string) => void;

  setHeight: (id: string, h: number) => void;
  moveBy: (id: string, dx: number, dy: number) => void;
  toggleCollapsed: (id: string) => void;
  tidy: () => void;
  select: (id: string | null) => void;
  focusOn: (id: string) => void;
};

function makeTurn(parentId: string | null, kind: TurnKind, quote?: string): Turn {
  return {
    id: nanoid(10),
    parentId,
    kind,
    quote,
    question: "",
    answer: "",
    status: "draft",
    createdAt: Date.now(),
  };
}

function makeBoard(): Board {
  const root = makeTurn(null, "root");
  const now = Date.now();
  return {
    id: nanoid(10),
    title: "Untitled board",
    rootId: root.id,
    turns: { [root.id]: root },
    offsets: {},
    collapsed: {},
    createdAt: now,
    updatedAt: now,
  };
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const mutateBoard = (boardId: string, fn: (b: Board) => Board) =>
        set((s) => {
          const b = s.boards[boardId];
          if (!b) return s;
          return { boards: { ...s.boards, [boardId]: { ...fn(b), updatedAt: Date.now() } } };
        });
      const mutateActive = (fn: (b: Board) => Board) => {
        const id = get().activeBoardId;
        if (id) mutateBoard(id, fn);
      };

      return {
        boards: {},
        activeBoardId: null,
        heights: {},
        selectedId: null,
        focus: null,

        newBoard: () => {
          const b = makeBoard();
          set((s) => ({ boards: { ...s.boards, [b.id]: b }, activeBoardId: b.id, selectedId: null }));
          return b.id;
        },

        deleteBoard: (id) =>
          set((s) => {
            const boards = { ...s.boards };
            delete boards[id];
            const remaining = Object.values(boards).sort((a, b) => b.updatedAt - a.updatedAt);
            if (remaining.length === 0) {
              const b = makeBoard();
              return { boards: { [b.id]: b }, activeBoardId: b.id, selectedId: null };
            }
            return {
              boards,
              activeBoardId: s.activeBoardId === id ? remaining[0].id : s.activeBoardId,
              selectedId: null,
            };
          }),

        setActiveBoard: (id) => set({ activeBoardId: id, selectedId: null }),

        renameBoard: (id, title) => mutateBoard(id, (b) => ({ ...b, title })),

        addDraft: (parentId, kind, quote) => {
          const boardId = get().activeBoardId!;
          const board = get().boards[boardId];
          // A thread has one continuation; asking a second follow-up means a new branch.
          const effectiveKind = kind === "followup" && followupOf(board, parentId) ? "branch" : kind;

          // Re-use an untouched draft in the same spot rather than stacking empties.
          const existing = childrenOf(board, parentId).find(
            (t) => t.status === "draft" && !t.question && t.kind === effectiveKind && t.quote === quote,
          );
          if (existing) {
            set({ selectedId: existing.id, focus: { id: existing.id, nonce: Date.now() } });
            return existing.id;
          }

          const turn = makeTurn(parentId, effectiveKind, quote);
          mutateBoard(boardId, (b) => ({
            ...b,
            turns: { ...b.turns, [turn.id]: turn },
            // Reveal the new card if its parent was collapsed.
            collapsed: { ...b.collapsed, [parentId]: false },
          }));
          set({ selectedId: turn.id, focus: { id: turn.id, nonce: Date.now() } });
          return turn.id;
        },

        updateTurn: (boardId, id, patch) =>
          mutateBoard(boardId, (b) => {
            const prev = b.turns[id];
            if (!prev) return b;
            const next = { ...prev, ...patch };
            const title =
              id === b.rootId && b.title === "Untitled board" && next.question
                ? shortLabel(next, 48)
                : b.title;
            return { ...b, title, turns: { ...b.turns, [id]: next } };
          }),

        removeTurn: (id) =>
          mutateActive((b) => {
            const turns = { ...b.turns };
            const offsets = { ...b.offsets };
            const collapsed = { ...b.collapsed };
            const gone = id === b.rootId ? descendantIds(b, id) : [id, ...descendantIds(b, id)];
            for (const g of gone) {
              delete turns[g];
              delete offsets[g];
              delete collapsed[g];
            }
            if (id === b.rootId) {
              turns[id] = { ...makeTurn(null, "root"), id };
              return { ...b, title: "Untitled board", turns, offsets, collapsed };
            }
            return { ...b, turns, offsets, collapsed };
          }),

        setHeight: (id, h) =>
          set((s) => (s.heights[id] === h ? s : { heights: { ...s.heights, [id]: h } })),

        moveBy: (id, dx, dy) =>
          mutateActive((b) => {
            const o = b.offsets[id] ?? { x: 0, y: 0 };
            return { ...b, offsets: { ...b.offsets, [id]: { x: o.x + dx, y: o.y + dy } } };
          }),

        toggleCollapsed: (id) =>
          mutateActive((b) => ({ ...b, collapsed: { ...b.collapsed, [id]: !b.collapsed[id] } })),

        tidy: () => mutateActive((b) => ({ ...b, offsets: {} })),

        select: (id) => set({ selectedId: id }),

        focusOn: (id) => set({ selectedId: id, focus: { id, nonce: Date.now() } }),
      };
    },
    {
      name: "branch-ui",
      version: 1,
      partialize: (s) => ({ boards: s.boards, activeBoardId: s.activeBoardId }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        // Streams don't survive a reload; settle anything that was mid-answer.
        if (!state) return;
        for (const b of Object.values(state.boards)) {
          for (const t of Object.values(b.turns)) {
            if (t.status === "streaming") {
              t.status = t.answer ? "done" : "error";
              if (!t.answer) t.error = "Interrupted by reload.";
            }
          }
        }
      },
    },
  ),
);

export function useActiveBoard(): Board | null {
  return useStore((s) => (s.activeBoardId ? (s.boards[s.activeBoardId] ?? null) : null));
}
