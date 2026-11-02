"use client";

import { useEffect, useState } from "react";
import { useActiveBoard, useStore } from "@/lib/store";
import { ensureActiveBoard } from "@/lib/actions";
import { loadApiKey } from "@/lib/apiKey";
import { Canvas } from "./Canvas";
import { ChatView } from "./ChatView";
import { KeyDialog } from "./KeyDialog";
import { NoteLayer } from "./Notes";

export function App() {
  const [hydrated, setHydrated] = useState(false);
  const board = useActiveBoard();

  useEffect(() => {
    // Boards live in localStorage, so hydrate on the client only.
    Promise.resolve(useStore.persist.rehydrate()).then(() => {
      ensureActiveBoard();
      setHydrated(true);
    });
    loadApiKey();
    fetch("/api/chat")
      .then((res) => res.json())
      .then(({ hasKey }) => useStore.setState({ serverHasKey: Boolean(hasKey) }))
      .catch(() => {});
  }, []);

  if (!hydrated || !board) return null;

  return (
    <>
      <Canvas board={board} />
      <ChatView board={board} />
      <NoteLayer board={board} />
      <KeyDialog />
    </>
  );
}
