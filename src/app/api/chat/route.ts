import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { ERROR_SENTINEL } from "@/lib/protocol";

const INSTRUCTIONS = `You are a thinking partner inside a branching canvas, not a linear chat.
The user explores topics as a tree: each answer appears on its own card, follow-ups continue a thread downward, and side questions open new branches. You only see the path from the root to the current card.

- Answer the question on this card directly and stay on its scope. Don't recap earlier cards.
- Cards are narrow (~440px). Prefer short paragraphs, tight lists and small examples over long essays. Use ### headings at most.
- When a question is a branch, treat it as a focused tangent: go deep on that one idea.
- If the topic naturally opens further directions, end with up to 3 short follow-up questions worth branching into, as a list under "**Branch ideas**".`;

function pickModel(): LanguageModel | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5");
  }
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    return process.env.AI_GATEWAY_MODEL ?? "anthropic/claude-sonnet-5.5";
  }
  return null;
}

export async function POST(req: Request) {
  const { messages, isBranch, branchDepth } = (await req.json()) as {
    messages: ModelMessage[];
    isBranch?: boolean;
    branchDepth?: number;
  };

  const model = pickModel();
  if (!model) return demoResponse(messages);

  let error: unknown = null;
  const result = streamText({
    model,
    instructions:
      INSTRUCTIONS +
      (isBranch ? `\n\nThis card is a branch (depth ${branchDepth ?? 1}).` : ""),
    messages,
    onError: ({ error: e }) => {
      error = e;
      console.error("[chat] stream error", e);
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of result.textStream) controller.enqueue(encoder.encode(chunk));
      // streamText swallows errors, so pass them to the client in-band.
      if (error) {
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(ERROR_SENTINEL + message));
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

/** Lets the canvas be tried without an API key. */
function demoResponse(messages: ModelMessage[]) {
  const last = messages[messages.length - 1];
  const q = typeof last?.content === "string" ? last.content : "";
  const text = `**Demo mode:** no model is configured, so this is a placeholder answer.

You asked:

> ${q.split("\n").filter(Boolean).slice(-1)[0] ?? ""}

This card got **${messages.filter((m) => m.role === "user").length - 1} earlier turn(s)** as context: only the path from the root to here, not sibling branches.

To get real answers, add one of these to \`.env.local\` and restart \`npm run dev\`:

- \`ANTHROPIC_API_KEY=...\` (direct to Anthropic)
- \`AI_GATEWAY_API_KEY=...\` (Vercel AI Gateway, any provider)

**Branch ideas**
- What happens if I branch from a highlighted sentence?
- How does the layout decide where cards go?`;

  const encoder = new TextEncoder();
  const words = text.split(/(?<=\s)/);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const w of words) {
        controller.enqueue(encoder.encode(w));
        await new Promise((r) => setTimeout(r, 12));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
