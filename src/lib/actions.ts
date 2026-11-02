"use client";

import { nanoid } from "nanoid";
import type { Board, LayoutMode, Turn, TurnKind } from "./types";
import { getActiveBoard, mutateActive, useStore, type AskMode, type State, type Toast } from "./store";
import { chainThrough, descendantIds, followupOf, pathTo, shortLabel, threadFrom } from "./tree";
import { NOTE_SIZE, type Slot } from "./layout";
import { afterLayout, fit, flyTo, focusBar, frameSlot, getCamera, glideNext } from "./view";
import { NOTE_COLORS } from "./colors";
import { submitTurn } from "./ask";
import { parseAnswer } from "./answer";
import { markOnCard } from "./search";
import { makeSampleBoard } from "./sample";

const get = () => useStore.getState();
const set = useStore.setState;
const UNTITLED = "Untitled board";

const FRESH_UI = { selectedId: null, asking: false, quote: null, chatId: null, barText: "", menuId: null, editNoteId: null, toast: null } satisfies Partial<State>;

/* ---------- Boards ---------- */

function emptyBoard(): Board {
  const now = Date.now();
  return {
    id: nanoid(10),
    title: UNTITLED,
    rootIds: [],
    turns: {},
    notes: [],
    mode: "threads",
    offsets: { threads: {}, mind: {} },
    sizes: {},
    collapsed: {},
    createdAt: now,
    updatedAt: now,
  };
}

function addBoard(board: Board) {
  set((s) => ({ ...FRESH_UI, boards: { ...s.boards, [board.id]: board }, activeBoardId: board.id }));
}

export function newBoard() {
  addBoard(emptyBoard());
  focusBar();
}

export const addExampleBoard = () => addBoard(makeSampleBoard());

export function setActiveBoard(id: string) {
  set({ ...FRESH_UI, activeBoardId: id });
}

export function deleteBoard(id: string) {
  set((s) => {
    const boards = { ...s.boards };
    delete boards[id];
    const remaining = Object.values(boards).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!remaining.length) {
      const b = emptyBoard();
      return { ...FRESH_UI, boards: { [b.id]: b }, activeBoardId: b.id };
    }
    return s.activeBoardId === id ? { ...FRESH_UI, boards, activeBoardId: remaining[0].id } : { boards };
  });
}

/** Open the most recent board, or show the example the very first time. */
export function ensureActiveBoard() {
  const s = get();
  if (s.activeBoardId && s.boards[s.activeBoardId]) return;
  const recent = Object.values(s.boards).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (recent) setActiveBoard(recent.id);
  else addExampleBoard();
}

/* ---------- Selecting ---------- */

/** Where the next answer would land, while the bar is sitting on the board. */
export function slotFor(s: Pick<State, "asking" | "quote" | "selectedId" | "askMode">, board: Board | null): Omit<Slot, "height"> | null {
  if (!s.asking || !board) return null;
  const parentId = s.quote?.turnId ?? s.selectedId;
  if (!parentId || !board.turns[parentId]) return null;
  const kind = !s.quote && s.askMode === "follow" && !followupOf(board, parentId) ? "followup" : "branch";
  return { parentId, kind };
}

export function select(id: string | null) {
  const s = get();
  const board = getActiveBoard();
  const slot = slotFor(s, board);
  if (slot && id !== slot.parentId) endAsk();
  const patch: Partial<State> = { selectedId: id };
  if (id && id !== s.selectedId && board?.turns[id]) patch.askMode = followupOf(board, id) ? "branch" : "follow";
  set(patch);
}

/* ---------- Asking ---------- */

function revealChildrenOf(id: string) {
  mutateActive((b) => (b.collapsed[id] ? { ...b, collapsed: { ...b.collapsed, [id]: false } } : b));
}

/** Follow up, Branch or a highlight: the bar moves to where the answer will land. */
export function beginAsk(id: string, mode: AskMode) {
  if (get().selectedId !== id) select(id);
  glideNext();
  revealChildrenOf(id);
  set({ askMode: mode, asking: true, menuId: null });
  afterLayout(() => frameSlot(id));
  focusBar();
}

export function setAskMode(mode: AskMode) {
  const s = get();
  if (!s.asking) {
    if (s.selectedId) beginAsk(s.selectedId, mode);
    return;
  }
  glideNext();
  set({ askMode: mode });
  afterLayout(() => s.selectedId && frameSlot(s.selectedId));
  focusBar();
}

export function endAsk() {
  glideNext();
  set({ asking: false, quote: null });
}

export function branchOnPassage(turnId: string, text: string) {
  const s = get();
  set({ quote: { turnId, text } });
  if (s.chatId) return focusBar();
  set({ asking: false });
  beginAsk(turnId, "branch");
}

export function clearQuote() {
  set({ quote: null });
}

function startAnswer(parentId: string | null, kind: TurnKind, question: string, quote?: string) {
  const board = getActiveBoard();
  if (!board) return;
  const id = nanoid(10);
  const turn: Turn = { id, parentId, kind, question, quote, answer: "", status: "streaming", createdAt: Date.now() };
  mutateActive((b) => ({
    ...b,
    title: !parentId && b.title === UNTITLED ? shortLabel(question, 48) : b.title,
    rootIds: parentId ? b.rootIds : [...b.rootIds, id],
    turns: { ...b.turns, [id]: turn },
    collapsed: parentId ? { ...b.collapsed, [parentId]: false } : b.collapsed,
  }));
  const inChat = !!get().chatId;
  set({ selectedId: id, askMode: "follow", menuId: null, chatId: inChat ? id : null });
  submitTurn(board.id, id);
  if (!inChat) afterLayout(() => flyTo(id));
}

/** What the bottom bar or the slot sends. Where the card goes depends on what's going on. */
export function ask(question: string) {
  const s = get();
  const board = getActiveBoard();
  if (!board) return;
  const q = question.trim();
  if (!q) return;

  let parentId: string | null = null;
  let kind: TurnKind = "root";
  let quote: string | undefined;
  const slot = slotFor(s, board);
  if (slot) {
    parentId = slot.parentId;
    kind = slot.kind;
    quote = s.quote?.text;
  } else if (s.quote) {
    parentId = s.quote.turnId;
    kind = "branch";
    quote = s.quote.text;
  } else {
    const target = s.chatId ? chainThrough(board, s.chatId).at(-1)?.id : s.selectedId;
    if (target && board.turns[target]) {
      parentId = target;
      const wantsFollow = !!s.chatId || s.askMode === "follow";
      kind = wantsFollow && !followupOf(board, target) ? "followup" : "branch";
    }
  }

  set((prev) => ({ asking: false, quote: null, barText: "", barFade: slot ? prev.barFade + 1 : prev.barFade }));
  startAnswer(parentId, kind, q, quote);
}

/** Open an idea as a branch, or go to it if it's already been explored. */
export function askIdea(parentId: string, question: string) {
  const s = get();
  const board = getActiveBoard();
  if (!board) return;
  const existing = Object.values(board.turns).find((t) => t.parentId === parentId && t.question === question);
  if (existing) {
    if (s.chatId) set({ chatId: existing.id, selectedId: existing.id });
    else {
      select(existing.id);
      afterLayout(() => flyTo(existing.id));
    }
    return;
  }
  set({ asking: false, quote: null });
  startAnswer(parentId, "branch", question);
}

export function askFromNote(text: string) {
  set({ asking: false, quote: null, selectedId: null });
  startAnswer(null, "root", text);
}

/* ---------- Cards ---------- */

export function deleteTurn(id: string) {
  const board = getActiveBoard();
  const turn = board?.turns[id];
  if (!board || !turn) return;
  const gone = [id, ...descendantIds(board, id)];
  mutateActive((b) => {
    const turns = { ...b.turns };
    const sizes = { ...b.sizes };
    const collapsed = { ...b.collapsed };
    const threads = { ...b.offsets.threads };
    const mind = { ...b.offsets.mind };
    for (const g of gone) {
      delete turns[g];
      delete sizes[g];
      delete collapsed[g];
      delete threads[g];
      delete mind[g];
    }
    return { ...b, turns, sizes, collapsed, offsets: { threads, mind }, rootIds: b.rootIds.filter((r) => r !== id) };
  });
  set((s) => ({ asking: false, quote: null, menuId: null, selectedId: s.selectedId && gone.includes(s.selectedId) ? turn.parentId : s.selectedId }));
}

/** Put the question back in the bar, in the same spot, to change it and ask again. */
export function editTurn(id: string) {
  const turn = getActiveBoard()?.turns[id];
  if (!turn) return;
  deleteTurn(id);
  set({ barText: turn.question, selectedId: turn.parentId });
  if (turn.parentId) {
    if (turn.quote) set({ quote: { turnId: turn.parentId, text: turn.quote } });
    beginAsk(turn.parentId, turn.kind === "followup" ? "follow" : "branch");
  } else focusBar();
}

export function toggleCollapsed(id: string) {
  glideNext();
  mutateActive((b) => ({ ...b, collapsed: { ...b.collapsed, [id]: !b.collapsed[id] } }));
  set({ menuId: null });
}

export function toggleExpanded(id: string) {
  set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } }));
}

export function resetCardSize(id: string) {
  glideNext();
  mutateActive((b) => {
    const sizes = { ...b.sizes };
    delete sizes[id];
    return { ...b, sizes };
  });
  set({ menuId: null });
}

/* ---------- Conversation view ---------- */

export function openChat(id: string) {
  set({ asking: false, quote: null, menuId: null, chatId: id, selectedId: id });
}

export function closeChat() {
  const id = get().chatId;
  set({ chatId: null, quote: null });
  if (id) afterLayout(() => flyTo(id));
}

/* ---------- Threads panel ---------- */

export function openThreads() {
  if (get().chatId) closeChat();
  set({ threadsOpen: true });
  // On a phone, focusing would cover the list with the keyboard.
  if (innerWidth > 760) afterLayout(() => document.getElementById("threadSearch")?.focus());
}

export function closeThreads() {
  set({ threadsOpen: false });
}

/** Open whatever is hiding these cards, since a collapsed card's children aren't on the board. */
function reveal(ids: string[]) {
  const board = getActiveBoard();
  if (!board || !ids.some((id) => board.collapsed[id])) return;
  glideNext();
  mutateActive((b) => {
    const collapsed = { ...b.collapsed };
    for (const id of ids) collapsed[id] = false;
    return { ...b, collapsed };
  });
}

export function goToThread(id: string) {
  const board = getActiveBoard();
  if (!board?.turns[id]) return;
  const cards = threadFrom(board, id).map((t) => t.id);
  reveal([...pathTo(board, id).map((t) => t.id), ...cards]);
  select(id);
  afterLayout(() => fit(cards));
}

export function goToCard(id: string) {
  const board = getActiveBoard();
  if (!board?.turns[id]) return;
  reveal(pathTo(board, id).map((t) => t.id).slice(0, -1));
  select(id);
  afterLayout(() => flyTo(id));
}

/** The card opened to show the last search match, closed again when the next one is opened. */
let openedForMatch: string | null = null;

/** Go to a search result, opening the card if the match is further down its answer. */
export function goToMatch(id: string, terms: string[], inAnswer: boolean) {
  const turn = getActiveBoard()?.turns[id];
  if (!turn) return;
  goToCard(id);
  const expanded = { ...get().expanded };
  if (openedForMatch && openedForMatch !== id) expanded[openedForMatch] = false;
  openedForMatch = null;
  if (inAnswer && !expanded[id] && parseAnswer(turn.answer).hasMore) {
    expanded[id] = true;
    openedForMatch = id;
  }
  glideNext();
  set({ expanded });
  // A frame later, because on a phone the panel is closing and clears the marks as it goes.
  afterLayout(() => requestAnimationFrame(() => markOnCard(id, terms)));
}

/* ---------- Board-wide ---------- */

export function setLayoutMode(mode: LayoutMode) {
  const board = getActiveBoard();
  if (!board || board.mode === mode) return;
  glideNext();
  mutateActive((b) => ({ ...b, mode }));
  afterLayout(() => fit());
}

export function goToMainThread() {
  const board = getActiveBoard();
  if (!board) return;
  const s = get();
  const root = s.selectedId && board.turns[s.selectedId] ? pathTo(board, s.selectedId)[0].id : board.rootIds[0];
  if (!root) return;
  select(root);
  fit(threadFrom(board, root).map((t) => t.id));
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(toast: Toast) {
  clearTimeout(toastTimer);
  set({ toast });
  toastTimer = setTimeout(() => set({ toast: null }), 6000);
}
export function hideToast() {
  clearTimeout(toastTimer);
  set({ toast: null });
}

export function tidyUp() {
  const board = getActiveBoard();
  if (!board) return;
  const { mode, offsets, notes } = board;
  glideNext();
  mutateActive((b) => ({
    ...b,
    offsets: { ...b.offsets, [mode]: {} },
    notes: b.notes.map((n, i) => ({ ...n, w: NOTE_SIZE, h: NOTE_SIZE, x: -356 + (i % 2) * 166, y: Math.floor(i / 2) * 166 })),
  }));
  afterLayout(() => fit());
  showToast({
    text: "Cards tidied.",
    undo: () => {
      glideNext();
      mutateActive((b) => ({ ...b, offsets: { ...b.offsets, [mode]: offsets[mode] }, notes }));
      afterLayout(() => fit());
    },
  });
}

/* ---------- Sticky notes ---------- */

export function addNote() {
  const board = getActiveBoard();
  if (!board) return;
  const cam = getCamera();
  const nudge = (board.notes.length % 4) * 14;
  const id = nanoid(10);
  const note = {
    id,
    text: "New note",
    color: NOTE_COLORS[board.notes.length % NOTE_COLORS.length],
    w: NOTE_SIZE,
    h: NOTE_SIZE,
    x: (innerWidth / 2 - cam.x) / cam.s - NOTE_SIZE / 2 + nudge,
    y: (innerHeight / 2 - cam.y) / cam.s - NOTE_SIZE / 2 + nudge,
  };
  mutateActive((b) => ({ ...b, notes: [...b.notes, note] }));
  set({ editNoteId: id });
}

export function deleteNote(id: string) {
  mutateActive((b) => ({ ...b, notes: b.notes.filter((n) => n.id !== id) }));
}

export function saveNoteText(id: string, text: string) {
  mutateActive((b) => ({ ...b, notes: b.notes.map((n) => (n.id === id ? { ...n, text: text.trim() || "Note" } : n)) }));
  set({ editNoteId: null });
}

/* ---------- Drag and resize, called on every pointer move ---------- */

export function moveCard(id: string, dx: number, dy: number, onlyThisCard: boolean) {
  mutateActive((b) => {
    const off = { ...b.offsets[b.mode] };
    const add = (key: string, x: number, y: number) => {
      off[key] = { x: (off[key]?.x ?? 0) + x, y: (off[key]?.y ?? 0) + y };
    };
    add(id, dx, dy);
    // Offsets carry down the tree, so cancel them on the children to leave them where they are.
    if (onlyThisCard) for (const t of Object.values(b.turns)) if (t.parentId === id) add(t.id, -dx, -dy);
    return { ...b, offsets: { ...b.offsets, [b.mode]: off } };
  });
}

export function moveNote(id: string, dx: number, dy: number) {
  mutateActive((b) => ({ ...b, notes: b.notes.map((n) => (n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)) }));
}

export function resizeItem(id: string, w: number, h: number) {
  mutateActive((b) =>
    b.notes.some((n) => n.id === id)
      ? { ...b, notes: b.notes.map((n) => (n.id === id ? { ...n, w, h } : n)) }
      : { ...b, sizes: { ...b.sizes, [id]: { w, h } } },
  );
}

export const STARTERS = [
  "Explain how transformers work, from first principles",
  "Brainstorm names for a cozy bookshop café",
  "Help me plan a 2-week trip to Japan",
];
