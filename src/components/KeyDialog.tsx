"use client";

import { useEffect, useState, type FormEvent } from "react";
import { showToast } from "@/lib/actions";
import { checkApiKey, removeApiKey, saveApiKey } from "@/lib/apiKey";
import { useStore } from "@/lib/store";
import { KeyIcon } from "./icons";

const close = () => useStore.setState({ keyOpen: false });

export function KeyButton() {
  const hasKey = useStore((s) => s.apiKey !== null);
  const serverHasKey = useStore((s) => s.serverHasKey);
  // A server with its own key already gives real answers, so there's nothing to ask for.
  if (!hasKey && serverHasKey !== false) return null;
  const label = hasKey ? "Your key" : "Add your key";
  return (
    <button className="ghost key-btn" aria-label={label} title={label} onClick={() => useStore.setState({ keyOpen: true })}>
      <KeyIcon />
      <span>{label}</span>
    </button>
  );
}

function KeyForm() {
  const saved = useStore((s) => s.apiKey);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "rejected" | "unreachable">("idle");

  useEffect(() => {
    // Captured, so closing the dialog doesn't also deselect the card behind it.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    addEventListener("keydown", onKeyDown, true);
    return () => removeEventListener("keydown", onKeyDown, true);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (!key || status === "checking") return;
    setStatus("checking");
    const result = await checkApiKey(key);
    if (result !== "ok") return setStatus(result);
    saveApiKey(key);
    close();
    showToast({ text: "Key saved. New questions get real answers." });
  };

  return (
    <div className="key-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <form className="key-dialog" role="dialog" aria-modal="true" aria-labelledby="key-title" onSubmit={submit}>
        <h2 id="key-title">Use your Anthropic key</h2>
        <p>Your key gets you real answers, and Anthropic bills your account for them.</p>
        <p>It&apos;s saved in this browser and sent only to Anthropic, never to Branch&apos;s server. Only add it on a computer you trust.</p>
        <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
          Get a key from Anthropic
        </a>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label="Anthropic API key"
          placeholder={saved ? `Saved key ending in ${saved.slice(-4)}` : "sk-ant-..."}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus("idle");
          }}
        />
        {status === "rejected" && <p className="key-error" role="alert">Anthropic didn&apos;t accept that key. Check that you copied all of it.</p>}
        {status === "unreachable" && <p className="key-error" role="alert">Couldn&apos;t check that key with Anthropic. Try again in a moment.</p>}
        <div className="key-actions">
          {saved && (
            <button
              type="button"
              className="ghost key-remove"
              onClick={() => {
                removeApiKey();
                close();
                showToast({ text: "Key removed from this browser." });
              }}
            >
              Remove key
            </button>
          )}
          <button type="button" className="ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="tidy" disabled={!value.trim() || status === "checking"}>
            {status === "checking" ? "Checking…" : "Save key"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function KeyDialog() {
  const open = useStore((s) => s.keyOpen);
  return open ? <KeyForm /> : null;
}
