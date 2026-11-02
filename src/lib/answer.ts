const OPEN = "<summary>";
const CLOSE = "</summary>";
const SUMMARY_MAX = 170;

export type ParsedAnswer = { summary: string; body: string; ideas: string[] };

/** A short plain-text summary, for answers that arrived without one. */
function fallbackSummary(body: string): string {
  const para = body.split(/\n{2,}/).find((p) => p.trim()) ?? "";
  const plain = para
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*(?:[-*>]|\d+\.)\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= SUMMARY_MAX) return plain;
  const cut = plain.slice(0, SUMMARY_MAX);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > 60) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

/**
 * Splits raw model output, which may still be streaming, into its three parts:
 *
 *   <summary>One or two sentences for the card.</summary>
 *   The full answer, in markdown.
 *   **Branch ideas**
 *   - A question worth exploring
 *
 * Every part is optional, so older boards and off-format answers still render.
 */
export function parseAnswer(raw: string): ParsedAnswer {
  const text = raw.trimStart();
  // The start of the tag is arriving: show nothing yet rather than a flash of "<summ".
  if (text && OPEN.startsWith(text)) return { summary: "", body: "", ideas: [] };

  let summary = "";
  let rest = text;
  if (text.startsWith(OPEN)) {
    const end = text.indexOf(CLOSE);
    summary = (end === -1 ? text.slice(OPEN.length) : text.slice(OPEN.length, end)).trim();
    rest = end === -1 ? "" : text.slice(end + CLOSE.length).trimStart();
  }

  let body = rest;
  let ideas: string[] = [];
  const m = rest.match(/(?:^|\n)[#*\s]*Branch ideas[*:\s]*\n/i);
  if (m && m.index !== undefined) {
    body = rest.slice(0, m.index).trimEnd();
    ideas = rest
      .slice(m.index + m[0].length)
      .split("\n")
      .map((l) => l.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)?.[1].trim())
      .filter((s): s is string => !!s)
      .map((s) => s.replace(/^\*\*(.*)\*\*$/, "$1"));
  }
  return { summary: summary || fallbackSummary(body), body, ideas };
}
