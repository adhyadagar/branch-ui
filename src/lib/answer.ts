/** Longer than this and the opening won't fit in the 3 lines a card shows. */
const FITS_ON_CARD = 140;

export type ParsedAnswer = {
  /** The opening of the answer as plain text, which is what a card shows. */
  lead: string;
  body: string;
  ideas: string[];
  /** Whether expanding the card would reveal anything beyond the lead. */
  hasMore: boolean;
};

/** The first paragraph as plain text. Headings are skipped: they name the answer rather than give it. */
function leadOf(body: string): { lead: string; blocks: number } {
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.replace(/^#+\s.*$/gm, "").trim())
    .filter(Boolean);
  const lead = (blocks[0] ?? "")
    .replace(/^\s*(?:[-*>]|\d+\.)\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { lead, blocks: blocks.length };
}

/**
 * Splits raw model output, which may still be streaming, into the answer and the
 * branch ideas that end it:
 *
 *   The answer, in markdown. Its first paragraph appears on the card.
 *   **Branch ideas**
 *   - A question worth exploring
 */
export function parseAnswer(raw: string): ParsedAnswer {
  const text = raw.trimStart();
  let body = text;
  let ideas: string[] = [];
  const m = text.match(/(?:^|\n)[#*\s]*Branch ideas[*:\s]*\n/i);
  if (m && m.index !== undefined) {
    body = text.slice(0, m.index).trimEnd();
    ideas = text
      .slice(m.index + m[0].length)
      .split("\n")
      .map((l) => l.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)?.[1].trim())
      .filter((s): s is string => !!s)
      .map((s) => s.replace(/^\*\*(.*)\*\*$/, "$1"));
  }
  const { lead, blocks } = leadOf(body);
  return { lead, body, ideas, hasMore: ideas.length > 0 || blocks > 1 || lead.length > FITS_ON_CARD };
}
