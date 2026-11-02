import type { LanguageModel } from "ai";
import { DEFAULT_MODEL } from "./prompt";

/**
 * The AI providers a visitor can connect with their own key. Each of these accepts calls
 * from a browser, which is what lets a key skip Branch's server. Adding a host here also
 * means adding it to the Content Security Policy in next.config.ts.
 */

export type ProviderId = "anthropic" | "openai" | "google" | "openrouter";

type Provider = {
  name: string;
  keysUrl: string;
  /** Tried in order for the default model, and listed first in the menu. */
  preferred: string[];
  /** A free request that shows whether a key works. */
  check: (key: string) => Promise<Response>;
  /** Statuses from `check` that mean the key is bad, rather than that something else went wrong. */
  rejects: number[];
  listModels: (key: string, checked: Response) => Promise<string[]>;
  model: (key: string, id: string) => Promise<LanguageModel>;
};

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });
const CHAT_WITH = { model: DEFAULT_MODEL, messages: [{ role: "user", content: "Hi" }] };
const ANTHROPIC_MODELS = [DEFAULT_MODEL, "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-1"];

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: {
    name: "Anthropic",
    keysUrl: "https://platform.claude.com/settings/keys",
    preferred: ANTHROPIC_MODELS,
    // Counting tokens is free. Anthropic's model list doesn't accept calls from browsers.
    check: (key) =>
      fetch("https://api.anthropic.com/v1/messages/count_tokens", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify(CHAT_WITH),
      }),
    rejects: [401, 403],
    listModels: async () => ANTHROPIC_MODELS,
    model: async (key, id) => {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey: key, headers: { "anthropic-dangerous-direct-browser-access": "true" } })(id);
    },
  },
  openai: {
    name: "OpenAI",
    keysUrl: "https://platform.openai.com/api-keys",
    preferred: ["gpt-6.1-terra", "gpt-6.1-sol", "gpt-6-luna"],
    check: (key) => fetch("https://api.openai.com/v1/models", { headers: bearer(key) }),
    rejects: [401, 403],
    listModels: async (_key, checked) => {
      const { data } = (await checked.json()) as { data: { id: string }[] };
      return data.map((m) => m.id).filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/audio|realtime|transcribe|tts|image|search|embedding|instruct/.test(id));
    },
    model: async (key, id) => {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey: key })(id);
    },
  },
  google: {
    name: "Google",
    keysUrl: "https://aistudio.google.com/apikey",
    preferred: ["gemini-3.8-flash", "gemini-3.7-flash"],
    check: (key) => fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } }),
    // Google answers a bad key with a 400.
    rejects: [400, 401, 403],
    listModels: async (_key, checked) => {
      const { models } = (await checked.json()) as { models: { name: string; supportedGenerationMethods?: string[] }[] };
      return models.filter((m) => m.supportedGenerationMethods?.includes("generateContent") && !/tts|image|live|embedding|robotics/.test(m.name)).map((m) => m.name.replace(/^models\//, ""));
    },
    model: async (key, id) => {
      const { createGoogle } = await import("@ai-sdk/google");
      return createGoogle({ apiKey: key })(id);
    },
  },
  openrouter: {
    name: "OpenRouter",
    keysUrl: "https://openrouter.ai/keys",
    preferred: ["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-terra", "google/gemini-3.8-flash"],
    check: (key) => fetch("https://openrouter.ai/api/v1/key", { headers: bearer(key) }),
    rejects: [401, 403],
    listModels: async () => {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      const { data } = (await res.json()) as { data: { id: string; architecture?: { output_modalities?: string[] } }[] };
      return data.filter((m) => m.architecture?.output_modalities?.includes("text") && !m.id.includes(":")).map((m) => m.id);
    },
    model: async (key, id) => {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey: key, baseURL: "https://openrouter.ai/api/v1" }).chat(id);
    },
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** Preferred models first, then the rest in order. */
export function sortModels(provider: ProviderId, models: string[]): string[] {
  const { preferred } = PROVIDERS[provider];
  const first = preferred.filter((id) => models.includes(id));
  return [...first, ...models.filter((id) => !first.includes(id)).sort()];
}
