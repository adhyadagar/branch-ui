import type { Turn } from "./types";
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

/** A card matches when every term appears somewhere in it, so word order and distance don't matter. */
function hitIn(turn: Turn, terms: string[]): Hit | null {
  // Ideas are searched without their "Branch ideas" heading, or every search for "branch" would match.
  const { body, ideas } = parseAnswer(turn.answer);
  const answer = plainText([turn.quote, body, ...ideas].filter(Boolean).join("\n\n"));
  const text = `${turn.question}\n${answer}`.toLowerCase();
  if (!terms.every((t) => text.includes(t))) return null;
  const at = answer.search(termPattern(terms));
  return { turn, excerpt: at < 0 ? "" : excerptAround(answer, at) };
}

export function searchThreads(threads: Thread[], terms: string[]): ThreadHits[] {
  const out: ThreadHits[] = [];
  for (const thread of threads) {
    const hits = thread.cards.flatMap((turn) => hitIn(turn, terms) ?? []);
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
  if (ranges.length) {
    const offset = (ranges[0].getBoundingClientRect().top - body.getBoundingClientRect().top) / getCamera().s;
    body.scrollTop += offset - BEFORE_MATCH;
  }
}
