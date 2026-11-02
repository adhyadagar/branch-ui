export type TurnKind = "root" | "followup" | "branch";

export type TurnStatus = "streaming" | "done" | "error";

/** One card on the canvas: a question and the model's answer to it. */
export type Turn = {
  id: string;
  parentId: string | null;
  /** followup = continues the parent's thread; branch = opens a new thread. */
  kind: TurnKind;
  question: string;
  /** Passage of the parent's answer this branch is about, if branched from a selection. */
  quote?: string;
  /** Raw model output. See lib/answer.ts for how it splits into summary, body and ideas. */
  answer: string;
  status: TurnStatus;
  error?: string;
  createdAt: number;
};

export type Note = {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * A highlight or note on a card. Unlike a sticky note, it belongs to the card.
 * A quote with no text is a plain highlight, and text with no quote is a note on the whole card.
 */
export type Annotation = {
  id: string;
  turnId: string;
  quote?: string;
  text: string;
  createdAt: number;
};

export type LayoutMode = "threads" | "mind";

export type Point = { x: number; y: number };

export type Board = {
  id: string;
  title: string;
  /** A board can hold several separate topics. */
  rootIds: string[];
  turns: Record<string, Turn>;
  notes: Note[];
  annotations: Annotation[];
  mode: LayoutMode;
  /** Manual drag offsets, per layout. They apply to a card and everything under it. */
  offsets: Record<LayoutMode, Record<string, Point>>;
  /** Cards the user has resized. */
  sizes: Record<string, { w: number; h: number }>;
  collapsed: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
};
