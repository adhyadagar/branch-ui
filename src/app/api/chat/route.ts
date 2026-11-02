import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { connection } from "next/server";
import { DEFAULT_MODEL, instructionsFor } from "@/lib/prompt";
import { ERROR_SENTINEL } from "@/lib/protocol";

function pickModel(): LanguageModel | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL);
  }
  // Only an explicit key counts. Vercel can sign gateway calls without one, which
  // would let anyone spend the host's money through this route, which has no login.
  if (process.env.AI_GATEWAY_API_KEY) {
    return process.env.AI_GATEWAY_MODEL ?? "anthropic/claude-sonnet-5.5";
  }
  return null;
}

function isChatMessage(m: unknown): m is { role: "user" | "assistant"; content: string } {
  if (typeof m !== "object" || m === null) return false;
  const { role, content } = m as { role?: unknown; content?: unknown };
  return (role === "user" || role === "assistant") && typeof content === "string";
}

/** Tells the page whether this server can answer, so it knows to offer key entry. */
export async function GET() {
  await connection();
  return Response.json({ hasKey: pickModel() !== null });
}

export async function POST(req: Request) {
  // Other sites can't send JSON here without a CORS preflight, which this route
  // never approves. That stops a page you visit from spending your API key.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response("Expected application/json.", { status: 415 });
  }

  const body = (await req.json().catch(() => null)) as {
    messages?: unknown;
    isBranch?: boolean;
    branchDepth?: number;
  } | null;
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isChatMessage)) {
    return new Response("Expected messages: { role, content }[].", { status: 400 });
  }

  const model = pickModel();
  if (!model) return demoResponse(messages);

  let error: unknown = null;
  const result = streamText({
    model,
    instructions: instructionsFor(body?.isBranch, body?.branchDepth),
    messages,
    // Stop button: closing the request cancels the model call, so it stops costing tokens.
    abortSignal: req.signal,
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
  const earlier = messages.filter((m) => m.role === "user").length - 1;
  const text = `**Demo mode:** this is a placeholder. A real model would see ${earlier === 1 ? "1 earlier card" : `${earlier} earlier cards`} here.

You asked:

> ${q.split("\n").filter(Boolean).slice(-1)[0] ?? ""}

This card got **${earlier} earlier turn(s)** as context: only the path from the root to here, not sibling branches.

To get real answers, press **Add your key** at the top of the board.

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
