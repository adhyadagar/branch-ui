"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import type { Board, Turn } from "./types";

export type Tool = "select" | "hand";
export type AskMode = "follow" | "branch";
export type Toast = { text: string; undo?: () => void };

type Persisted = {
  boards: Record<string, Board>;
  activeBoardId: string | null;
  tipsHidden: boolean;
};

export type State = Persisted & {
  selectedId: string | null;
  /** The prompt bar has moved to the slot where the next answer will land. */
  asking: boolean;
  askMode: AskMode;
  /** A highlighted passage the next question is about. */
  quote: { turnId: string; text: string } | null;
  /** The card whose path is open as a conversation. */
  chatId: string | null;
  barText: string;
  /** Bumped when a question is sent from the slot, so the bar fades back in at home. */
  barFade: number;
  expanded: Record<string, boolean>;
  menuId: string | null;
  tool: Tool;
  outlineOpen: boolean;
  editNoteId: string | null;
  toast: Toast | null;
};

let pending: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const flushWrites = () => {
  clearTimeout(timer);
  pending?.();
  pending = null;
};

/** Writing every drag step and streamed token to localStorage would make the board stutter. */
const debouncedStorage: PersistStorage<Persisted> = {
  getItem(name) {
    try {
      const raw = localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<Persisted>) : null;
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    pending = () => {
      try {
        localStorage.setItem(name, JSON.stringify(value));
      } catch (err) {
        console.error("[branch] could not save boards", err);
      }
    };
    clearTimeout(timer);
    timer = setTimeout(flushWrites, 400);
  },
  removeItem(name) {
    localStorage.removeItem(name);
  },
};
if (typeof window !== "undefined") addEventListener("pagehide", flushWrites);

/** v1 boards had one root, draft cards and a single set of offsets. */
function migrateBoardV1(old: Record<string, unknown>): Board {
  const turns = { ...(old.turns as Record<string, Turn>) };
  for (const id in turns) if ((turns[id].status as string) === "draft") delete turns[id];
  const rootId = old.rootId as string;
  return {
    id: old.id as string,
    title: old.title as string,
    rootIds: turns[rootId] ? [rootId] : [],
    turns,
    notes: [],
    mode: "threads",
    offsets: { threads: (old.offsets as Board["offsets"]["threads"]) ?? {}, mind: {} },
    sizes: {},
    collapsed: (old.collapsed as Board["collapsed"]) ?? {},
    createdAt: old.createdAt as number,
    updatedAt: old.updatedAt as number,
  };
}

export const useStore = create<State>()(
  persist(
    (): State => ({
      boards: {},
      activeBoardId: null,
      tipsHidden: false,
      selectedId: null,
      asking: false,
      askMode: "follow",
      quote: null,
      chatId: null,
      barText: "",
      barFade: 0,
      expanded: {},
      menuId: null,
      tool: "select",
      outlineOpen: false,
      editNoteId: null,
      toast: null,
    }),
    {
      name: "branch-ui",
      version: 3,
      storage: debouncedStorage,
      partialize: (s): Persisted => ({ boards: s.boards, activeBoardId: s.activeBoardId, tipsHidden: s.tipsHidden }),
      skipHydration: true,
      migrate: (persisted, version) => {
        const p = persisted as Persisted;
        const boards: Persisted["boards"] = {};
        for (const [id, b] of Object.entries(p.boards ?? {})) {
          boards[id] = version < 2 ? migrateBoardV1(b as unknown as Record<string, unknown>) : b;
          // v2 answers began with a <summary> tag; cards now show the answer's first paragraph.
          if (version < 3) {
            const turns = { ...boards[id].turns };
            for (const t in turns) turns[t] = { ...turns[t], answer: turns[t].answer.replace(/^\s*<summary>[\s\S]*?<\/summary>\s*/, "") };
            boards[id] = { ...boards[id], turns };
          }
        }
        return { boards, activeBoardId: p.activeBoardId ?? null, tipsHidden: p.tipsHidden ?? false };
      },
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

export const getActiveBoard = (): Board | null => {
  const s = useStore.getState();
  return s.activeBoardId ? (s.boards[s.activeBoardId] ?? null) : null;
};

export function useActiveBoard(): Board | null {
  return useStore((s) => (s.activeBoardId ? (s.boards[s.activeBoardId] ?? null) : null));
}

export function mutateBoard(boardId: string, fn: (b: Board) => Board) {
  useStore.setState((s) => {
    const b = s.boards[boardId];
    if (!b) return s;
    return { boards: { ...s.boards, [boardId]: { ...fn(b), updatedAt: Date.now() } } };
  });
}

export function mutateActive(fn: (b: Board) => Board) {
  const id = useStore.getState().activeBoardId;
  if (id) mutateBoard(id, fn);
}

export function updateTurn(boardId: string, id: string, patch: Partial<Turn>) {
  mutateBoard(boardId, (b) => (b.turns[id] ? { ...b, turns: { ...b.turns, [id]: { ...b.turns[id], ...patch } } } : b));
}
