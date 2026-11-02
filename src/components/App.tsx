"use client";

import { useEffect, useState } from "react";
import { useActiveBoard, useStore } from "@/lib/store";
import { ensureActiveBoard } from "@/lib/actions";
import { introduceOnce, loadConnection } from "@/lib/connection";
import { Canvas } from "./Canvas";
import { ChatView } from "./ChatView";
import { ConnectDialog } from "./ConnectDialog";
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
    loadConnection();
    fetch("/api/chat")
      .then((res) => res.json())
      .then(({ hasKey }) => {
        useStore.setState({ serverHasKey: Boolean(hasKey) });
        introduceOnce();
      })
      .catch(() => {});
  }, []);

  if (!hydrated || !board) return null;

  return (
    <>
      <Canvas board={board} />
      <ChatView board={board} />
      <NoteLayer board={board} />
      <ConnectDialog />
    </>
  );
}
