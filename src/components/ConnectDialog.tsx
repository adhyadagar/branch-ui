"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { showToast } from "@/lib/actions";
import { disconnect, saveConnection, verifyKey, type Connection } from "@/lib/connection";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "@/lib/providers";
import { useStore } from "@/lib/store";
import { KeyIcon } from "./icons";

const open = () => useStore.setState({ connectOpen: true, connectIntro: false });
const close = () => useStore.setState({ connectOpen: false, connectIntro: false });

export function ConnectButton() {
  const provider = useStore((s) => s.connection?.provider);
  const serverHasKey = useStore((s) => s.serverHasKey);
  // A server with its own key already gives real answers, so there's nothing to ask for.
  if (!provider && serverHasKey !== false) return null;
  const label = provider ? PROVIDERS[provider].name : "Connect AI";
  return (
    <button className="ghost connect-btn" aria-label={label} title={provider ? `Connected to ${label}` : "Connect an AI provider"} onClick={open}>
      <KeyIcon />
      <span>{label}</span>
    </button>
  );
}

/** Shown in the prompt bar, so it's clear why answers are placeholders before anyone asks. */
export function ConnectNote() {
  const connected = useStore((s) => s.connection !== null);
  const serverHasKey = useStore((s) => s.serverHasKey);
  if (connected || serverHasKey !== false) return null;
  return (
    <div className="connect-note">
      <span>Connect an AI provider to get real answers. Until then, new questions get placeholders.</span>
      <button type="button" onClick={open}>
        Connect
      </button>
    </div>
  );
}

function ConnectForm() {
  const intro = useStore((s) => s.connectIntro);
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "rejected" | "unreachable">("idle");
  const { name, keysUrl } = PROVIDERS[provider];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed || status === "verifying") return;
    setStatus("verifying");
    const result = await verifyKey(provider, trimmed);
    if (result.status !== "ok") return setStatus(result.status);
    const model = result.models[0];
    saveConnection({ provider, key: trimmed, model });
    close();
    showToast({ text: `Connected to ${name}, using ${model}.` });
  };

  return (
    <form onSubmit={submit}>
      <h2 id="connect-title">{intro ? "Connect an AI provider to get started" : "Connect an AI provider"}</h2>
      {intro ? (
        <p>Branch needs an API key from an AI provider to answer your questions. Without one, you can explore the example board, but new questions only get placeholder answers.</p>
      ) : (
        <p>Branch uses your own API key to generate answers. Your provider bills you directly for usage.</p>
      )}

      <div className="connect-field" role="group" aria-label="Provider">
        <span className="connect-label">Provider</span>
        <div className="connect-providers">
          {PROVIDER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === provider}
              onClick={() => {
                setProvider(id);
                setStatus("idle");
              }}
            >
              {PROVIDERS[id].name}
            </button>
          ))}
        </div>
      </div>

      <label className="connect-field">
        <span className="connect-label">
          API key
          <a href={keysUrl} target="_blank" rel="noreferrer">
            Get an API key
          </a>
        </span>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={`Paste your ${name} key`}
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setStatus("idle");
          }}
        />
      </label>

      {status === "rejected" && <p className="connect-error" role="alert">{name} rejected this key. Check that it&apos;s complete and try again.</p>}
      {status === "unreachable" && <p className="connect-error" role="alert">Couldn&apos;t verify this key with {name}. Try again in a moment.</p>}

      <p className="connect-fine">Your key is stored only in this browser and sent directly to {name}. It never reaches Branch&apos;s servers. Avoid adding it on a shared computer.</p>

      <div className="connect-actions">
        <button type="button" className="ghost" onClick={close}>
          {intro ? "Explore the example first" : "Cancel"}
        </button>
        <button type="submit" className="tidy" disabled={!key.trim() || status === "verifying"}>
          {status === "verifying" ? "Verifying…" : "Connect"}
        </button>
      </div>
    </form>
  );
}

function Connected({ connection }: { connection: Connection }) {
  const { provider, key, model } = connection;
  const { name } = PROVIDERS[provider];
  const [models, setModels] = useState([model]);

  useEffect(() => {
    let current = true;
    verifyKey(provider, key).then((result) => {
      if (current && result.status === "ok") setModels(result.models);
    });
    return () => {
      current = false;
    };
  }, [provider, key]);

  return (
    <div>
      <h2 id="connect-title">Connected to {name}</h2>
      <p>Using the API key ending in {key.slice(-4)}. {name} bills you directly for usage.</p>
      <label className="connect-field">
        <span className="connect-label">Model</span>
        <select value={model} onChange={(e) => saveConnection({ ...connection, model: e.target.value })}>
          {models.includes(model) ? null : <option value={model}>{model}</option>}
          {models.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <p className="connect-fine">Your key is stored only in this browser. To use a different key or provider, disconnect first.</p>
      <div className="connect-actions">
        <button type="button" className="ghost connect-disconnect" onClick={disconnect}>
          Disconnect
        </button>
        <button type="button" className="tidy" onClick={close}>
          Done
        </button>
      </div>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
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

  return (
    <div className="connect-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="connect-dialog" role="dialog" aria-modal="true" aria-labelledby="connect-title">
        {children}
      </div>
    </div>
  );
}

export function ConnectDialog() {
  const isOpen = useStore((s) => s.connectOpen);
  const connection = useStore((s) => s.connection);
  if (!isOpen) return null;
  return <Frame>{connection ? <Connected connection={connection} /> : <ConnectForm />}</Frame>;
}
