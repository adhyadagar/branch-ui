"use client";

import type { ModelMessage } from "ai";
import { DEFAULT_MODEL } from "./prompt";
import { useStore } from "./store";

/**
 * A visitor's own Anthropic key. It stays in this browser and goes straight to Anthropic,
 * so it never reaches Branch's server. It's kept apart from the boards in localStorage.
 */

const STORAGE_KEY = "branch-api-key";
const BROWSER_ACCESS = { "anthropic-dangerous-direct-browser-access": "true" };

export function loadApiKey() {
  try {
    useStore.setState({ apiKey: localStorage.getItem(STORAGE_KEY) });
  } catch {
    // Storage can be blocked. A key entered now still works until the page closes.
  }
}

export function saveApiKey(key: string) {
  useStore.setState({ apiKey: key });
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {}
}

export function removeApiKey() {
  useStore.setState({ apiKey: null });
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Counting tokens is free, so checking a key doesn't spend anything. Anthropic's model list blocks browsers. */
export async function checkApiKey(key: string): Promise<"ok" | "rejected" | "unreachable"> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", ...BROWSER_ACCESS },
      body: JSON.stringify({ model: DEFAULT_MODEL, messages: [{ role: "user", content: "Hi" }] }),
    });
    if (res.ok) return "ok";
    return res.status === 401 || res.status === 403 ? "rejected" : "unreachable";
  } catch {
    return "unreachable";
  }
}

/** Loaded on first use, since most of a page's visits never need the model libraries. */
export async function* streamFromAnthropic(key: string, instructions: string, messages: ModelMessage[], signal: AbortSignal) {
  const [{ streamText }, { createAnthropic }] = await Promise.all([import("ai"), import("@ai-sdk/anthropic")]);
  const anthropic = createAnthropic({ apiKey: key, headers: BROWSER_ACCESS });

  let error: unknown = null;
  const result = streamText({
    model: anthropic(DEFAULT_MODEL),
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
    if ((error as { statusCode?: number }).statusCode === 401) throw new Error("Anthropic didn't accept your key. Check it under Your key at the top of the board.");
    throw error;
  }
  if ((await result.finishReason) === "content-filter") throw new Error("The model declined to answer this one.");
}
