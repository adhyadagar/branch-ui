export type TurnKind = "root" | "followup" | "branch";

export type TurnStatus = "draft" | "streaming" | "done" | "error";

/** One card on the canvas: a question and the model's answer to it. */
export type Turn = {
  id: string;
  parentId: string | null;
  /** followup = continues the parent's thread (below); branch = opens a new thread (right). */
  kind: TurnKind;
  question: string;
  /** Passage of the parent's answer this branch is about, if branched from a selection. */
  quote?: string;
  answer: string;
  status: TurnStatus;
  error?: string;
  createdAt: number;
};

export type Board = {
  id: string;
  title: string;
  rootId: string;
  turns: Record<string, Turn>;
  /** Manual drag offsets; they apply to the node and everything under it. */
  offsets: Record<string, { x: number; y: number }>;
  collapsed: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
};
