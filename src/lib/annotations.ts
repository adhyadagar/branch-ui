import type { Board } from "./types";
import { scrollCardTo } from "./search";

const HIGHLIGHT = "branch-note";

/**
 * Passages are found again by their text, because answers render differently on a card
 * and in the chat. Whitespace is ignored since a selection across paragraphs changes it.
 */
function findPassage(root: Element, quote: string): Range | null {
  const needle = quote.replace(/\s+/g, "");
  if (!needle) return null;
  const chars: { node: Node; at: number }[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = node.textContent ?? "";
    for (let at = 0; at < value.length; at++) {
      if (/\s/.test(value[at])) continue;
      text += value[at];
      chars.push({ node, at });
    }
  }
  const start = text.indexOf(needle);
  if (start < 0) return null;
  const first = chars[start];
  const last = chars[start + needle.length - 1];
  const range = new Range();
  range.setStart(first.node, first.at);
  range.setEnd(last.node, last.at + 1);
  return range;
}

let painted: { id: string; range: Range }[] = [];

/** The dot at the start of a highlight, which is what tells you there's a note to open. */
function placeDot(answer: Element, range: Range, id: string) {
  const rect = range.getClientRects()[0];
  if (!rect) return;
  // A passage cut off by the card's three-line preview has nothing to point at.
  const lead = answer.querySelector(".lead");
  if (lead && rect.top >= lead.getBoundingClientRect().bottom) return;
  const box = answer.getBoundingClientRect();
  const zoom = box.width / (answer as HTMLElement).offsetWidth || 1;
  const dot = document.createElement("button");
  dot.className = "note-dot";
  dot.dataset.noteId = id;
  dot.title = "Open this note";
  dot.setAttribute("aria-label", "Open this note");
  dot.style.left = `${(rect.left - box.left) / zoom}px`;
  dot.style.top = `${(rect.top - box.top) / zoom}px`;
  answer.append(dot);
}

/** Highlight every noted passage on screen, without changing the rendered answers. */
export function paintAnnotations(board: Board) {
  document.querySelectorAll(".note-dot").forEach((dot) => dot.remove());
  painted = [];
  for (const a of board.annotations) {
    if (!a.quote) continue;
    for (const el of document.querySelectorAll(`[data-answer-of="${a.turnId}"]`)) {
      const range = findPassage(el, a.quote);
      if (!range) continue;
      painted.push({ id: a.id, range });
      if (a.text.trim()) placeDot(el, range, a.id);
    }
  }
  if ("highlights" in CSS) CSS.highlights.set(HIGHLIGHT, new Highlight(...painted.map((p) => p.range)));
}

/** The time for a note written today, otherwise the day. */
export function whenWritten(at: number): string {
  const date = new Date(at);
  const today = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(undefined, today ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" });
}

/** The note whose highlight is under this point. Highlights aren't elements, so they can't be clicked directly. */
export function annotationAt(container: Element, x: number, y: number): string | null {
  const hit = painted.find(
    (p) => container.contains(p.range.startContainer) && [...p.range.getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom),
  );
  return hit?.id ?? null;
}

export function scrollToPassage(turnId: string, quote: string) {
  const body = document.querySelector(`[data-item="${turnId}"] .c-body`);
  const answer = body?.querySelector("[data-answer-of]");
  const range = answer && findPassage(answer, quote);
  if (body && range) scrollCardTo(body, range);
}
