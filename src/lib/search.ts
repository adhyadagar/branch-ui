import type { Annotation, Turn } from "./types";
import type { Thread } from "./tree";
import { parseAnswer } from "./answer";
import { getCamera } from "./view";

const HIGHLIGHT = "branch-search";
const BEFORE_MATCH = 40;
const EXCERPT = 200;

export type Hit = {
  turn: Turn;
  /** The part of the answer around the match. Empty when only the question matched. */
  excerpt: string;
};

export type ThreadHits = { thread: Thread; hits: Hit[] };

export const searchTerms = (query: string): string[] => query.toLowerCase().split(/\s+/).filter(Boolean);

/** Matches any term, longest first so a shorter term can't split a longer one. */
export function termPattern(terms: string[]): RegExp {
  const alternatives = [...terms].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(${alternatives.join("|")})`, "giu");
}

function plainText(markdown: string): string {
  return markdown
    .replace(/^\s*(?:#+|[-*>]|\d+\.)\s+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*+|`+|__|\|/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptAround(text: string, at: number): string {
  const from = at > BEFORE_MATCH ? text.lastIndexOf(" ", at - BEFORE_MATCH) + 1 : 0;
  return (from > 0 ? "…" : "") + text.slice(from, from + EXCERPT);
}

/** A noted passage with the words around it, since a few highlighted words alone are hard to place later. */
export function passageInContext(answer: string, quote: string): { before: string; quote: string; after: string } | null {
  const text = plainText(parseAnswer(answer).body);
  const passage = plainText(quote);
  const at = text.indexOf(passage);
  if (at < 0) return null;
  const from = at > BEFORE_MATCH ? text.lastIndexOf(" ", at - BEFORE_MATCH) + 1 : 0;
  return { before: (from > 0 ? "…" : "") + text.slice(from, at), quote: passage, after: text.slice(at + passage.length, at + passage.length + EXCERPT) };
}

/** A card matches when every term appears somewhere in it, so word order and distance don't matter. */
function hitIn(turn: Turn, terms: string[], notes: Annotation[]): Hit | null {
  // Ideas are searched without their "Branch ideas" heading, or every search for "branch" would match.
  const { body, ideas } = parseAnswer(turn.answer);
  const written = notes.filter((n) => n.turnId === turn.id).map((n) => n.text);
  const answer = plainText([turn.quote, body, ...ideas, ...written].filter(Boolean).join("\n\n"));
  const text = `${turn.question}\n${answer}`.toLowerCase();
  if (!terms.every((t) => text.includes(t))) return null;
  const at = answer.search(termPattern(terms));
  return { turn, excerpt: at < 0 ? "" : excerptAround(answer, at) };
}

export function searchThreads(threads: Thread[], terms: string[], notes: Annotation[]): ThreadHits[] {
  const out: ThreadHits[] = [];
  for (const thread of threads) {
    const hits = thread.cards.flatMap((turn) => hitIn(turn, terms, notes) ?? []);
    if (hits.length) out.push({ thread, hits });
  }
  return out;
}

/* ---------- Showing a match on its card ---------- */

export function clearCardMarks() {
  if ("highlights" in CSS) CSS.highlights.delete(HIGHLIGHT);
}

/** Highlight the terms on a card without touching its DOM, and scroll the first one into view. */
export function markOnCard(id: string, terms: string[]) {
  if (!("highlights" in CSS)) return;
  const body = document.querySelector(`[data-item="${id}"] .c-body`);
  if (!body) return;
  const pattern = termPattern(terms);
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    for (const m of node.textContent!.matchAll(pattern)) {
      const range = new Range();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      ranges.push(range);
    }
  }
  CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
  if (ranges.length) scrollCardTo(body, ranges[0]);
}

/** Scroll a card's own body to a passage. Screen distances are divided by the zoom to get the card's. */
export function scrollCardTo(body: Element, range: Range) {
  const offset = (range.getBoundingClientRect().top - body.getBoundingClientRect().top) / getCamera().s;
  body.scrollTop += offset - BEFORE_MATCH;
}
