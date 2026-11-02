"use client";

import { useEffect, useState } from "react";
import { useActiveBoard, useStore } from "@/lib/store";
import { ensureActiveBoard } from "@/lib/actions";
import { Canvas } from "./Canvas";
import { ChatView } from "./ChatView";
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
  }, []);

  if (!hydrated || !board) return null;

  return (
    <>
      <Canvas board={board} />
      <ChatView board={board} />
      <NoteLayer board={board} />
    </>
  );
}
