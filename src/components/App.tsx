"use client";

import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useActiveBoard, useStore } from "@/lib/store";
import { Canvas } from "./Canvas";
import { Sidebar } from "./Sidebar";

export function App() {
  const [hydrated, setHydrated] = useState(false);
  const board = useActiveBoard();

  useEffect(() => {
    // Boards live in localStorage, so hydrate on the client only.
    Promise.resolve(useStore.persist.rehydrate()).then(() => {
      const s = useStore.getState();
      if (!s.activeBoardId || !s.boards[s.activeBoardId]) {
        const recent = Object.values(s.boards).sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (recent) s.setActiveBoard(recent.id);
        else s.newBoard();
      }
      setHydrated(true);
    });
  }, []);

  if (!hydrated || !board) return <div className="h-screen w-screen bg-[var(--bg)]" />;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <Sidebar board={board} />
      <main className="relative min-w-0 flex-1">
        <ReactFlowProvider>
          <Canvas board={board} />
        </ReactFlowProvider>
      </main>
    </div>
  );
}
