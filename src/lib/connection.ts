"use client";

import type { ModelMessage } from "ai";
import { PROVIDERS, sortModels, type ProviderId } from "./providers";
import { useStore } from "./store";

/**
 * A visitor's own connection to an AI provider. The key stays in this browser and goes
 * straight to the provider, so it never reaches Branch's server. It's kept apart from the
 * boards in localStorage.
 */

export type Connection = { provider: ProviderId; key: string; model: string };

const STORAGE_KEY = "branch-connection";
const SEEN_KEY = "branch-connect-seen";

export function loadConnection() {
  try {
    // The first version only took an Anthropic key, saved on its own.
    const oldKey = localStorage.getItem("branch-api-key");
    if (oldKey) {
      saveConnection({ provider: "anthropic", key: oldKey, model: PROVIDERS.anthropic.preferred[0] });
      localStorage.removeItem("branch-api-key");
      return;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Connection;
      if (PROVIDERS[saved.provider]) useStore.setState({ connection: saved });
    }
  } catch {
    // Storage can be blocked. A key entered now still works until the page closes.
  }
}

export function saveConnection(connection: Connection) {
  useStore.setState({ connection });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
  } catch {}
}

export function disconnect() {
  useStore.setState({ connection: null });
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Open the dialog with its introduction once, for a visitor with no way to get answers yet. */
export function introduceOnce() {
  const s = useStore.getState();
  if (s.connection || s.serverHasKey !== false) return;
  try {
    if (localStorage.getItem(SEEN_KEY)) return;
    localStorage.setItem(SEEN_KEY, "1");
  } catch {}
  useStore.setState({ connectOpen: true, connectIntro: true });
}

export type Verified = { status: "ok"; models: string[] } | { status: "rejected" | "unreachable" };

export async function verifyKey(provider: ProviderId, key: string): Promise<Verified> {
  const p = PROVIDERS[provider];
  let res: Response;
  try {
    res = await p.check(key);
  } catch {
    return { status: "unreachable" };
  }
  if (p.rejects.includes(res.status)) return { status: "rejected" };
  if (!res.ok) return { status: "unreachable" };
  // A working key shouldn't fail over the menu of models, so fall back to the usual ones.
  const models = await p.listModels(key, res).catch(() => [] as string[]);
  return { status: "ok", models: models.length ? sortModels(provider, models) : p.preferred };
}

/** Loaded on first use, since many visits never need the model libraries. */
export async function* streamFromProvider({ provider, key, model }: Connection, instructions: string, messages: ModelMessage[], signal: AbortSignal) {
  const [{ streamText }, languageModel] = await Promise.all([import("ai"), PROVIDERS[provider].model(key, model)]);

  let error: unknown = null;
  const result = streamText({
    model: languageModel,
    instructions,
    messages,
    abortSignal: signal,
    onError: ({ error: e }) => {
      error = e;
    },
  });
  for await (const chunk of result.textStream) yield chunk;
  signal.throwIfAborted();
  // streamText swallows errors, so raise them here.
  if (error) {
    const { name } = PROVIDERS[provider];
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) throw new Error(`${name} rejected your API key. Reconnect using the ${name} button at the top of the board.`);
    throw error;
  }
  if ((await result.finishReason) === "content-filter") throw new Error("The model declined to answer this question.");
}
