"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import type { Board } from "@/lib/types";
import { useStore } from "@/lib/store";
import { childrenOf, descendantIds, mainThread, pathTo } from "@/lib/tree";
import { CARD_W, layoutBoard } from "@/lib/layout";
import { threadColors } from "@/lib/colors";
import { TurnNode, type TurnFlowNode } from "./TurnNode";
import { SelectionBranch } from "./SelectionBranch";

const nodeTypes = { turn: TurnNode };

export function Canvas({ board }: { board: Board }) {
  const heights = useStore((s) => s.heights);
  const selectedId = useStore((s) => s.selectedId);
  const focus = useStore((s) => s.focus);
  const { setHeight, select, moveBy, tidy } = useStore.getState();
  const rf = useReactFlow();

  const positions = useMemo(() => layoutBoard(board, heights), [board, heights]);
  const colors = useMemo(() => threadColors(board), [board]);
  const path = useMemo(
    () => new Set(selectedId && board.turns[selectedId] ? pathTo(board, selectedId).map((t) => t.id) : []),
    [board, selectedId],
  );

  const nodes = useMemo<TurnFlowNode[]>(
    () =>
      Object.entries(positions).map(([id, position]) => {
        const turn = board.turns[id];
        const kids = childrenOf(board, id);
        const collapsed = !!board.collapsed[id];
        return {
          id,
          type: "turn",
          position,
          selected: id === selectedId,
          // Controlled flow: hand React Flow back the size it measured.
          measured: heights[id] ? { width: CARD_W, height: heights[id] } : undefined,
          data: {
            turn,
            boardId: board.id,
            color: colors[id],
            hasFollowup: kids.some((k) => k.kind === "followup"),
            childCount: kids.length,
            hiddenCount: collapsed ? descendantIds(board, id).length : 0,
            collapsed,
            onPath: path.has(id),
            dimmed: path.size > 0 && !path.has(id),
            childQuestions: Object.fromEntries(kids.map((k) => [k.id, k.question])),
          },
        };
      }),
    [positions, board, selectedId, heights, colors, path],
  );

  const edges = useMemo<Edge[]>(
    () =>
      Object.keys(positions).flatMap((id) => {
        const turn = board.turns[id];
        if (!turn.parentId || !positions[turn.parentId]) return [];
        const follow = turn.kind === "followup";
        const onPath = path.has(id);
        return [
          {
            id: `${turn.parentId}-${id}`,
            source: turn.parentId,
            target: id,
            sourceHandle: follow ? "b" : "r",
            targetHandle: follow ? "t" : "l",
            type: follow ? "straight" : "default",
            animated: turn.status === "streaming",
            style: {
              stroke: colors[id],
              strokeWidth: onPath ? 2.5 : 1.5,
              opacity: path.size > 0 && !onPath ? 0.3 : 0.9,
            },
          },
        ];
      }),
    [positions, board, colors, path],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<TurnFlowNode>[]) => {
      for (const c of changes) {
        if (c.type === "dimensions" && c.dimensions) setHeight(c.id, Math.round(c.dimensions.height));
        else if (c.type === "select" && c.selected) select(c.id);
        else if (c.type === "position" && c.position && c.dragging) {
          const cur = positions[c.id];
          if (cur) moveBy(c.id, c.position.x - cur.x, c.position.y - cur.y);
        }
      }
    },
    [positions, setHeight, select, moveBy],
  );

  // Fly to a card when something asks for it (new draft, outline click, …).
  const lastFocus = useRef<number>(0);
  useEffect(() => {
    if (!focus || focus.nonce === lastFocus.current) return;
    const pos = positions[focus.id];
    if (!pos) return;
    lastFocus.current = focus.nonce;
    const h = Math.min(heights[focus.id] ?? 200, 560);
    const zoom = Math.max(rf.getZoom(), 0.8);
    rf.setCenter(pos.x + CARD_W / 2, pos.y + h / 2, { zoom, duration: 450 });
  }, [focus, positions, heights, rf]);

  // Fit the board when switching to it.
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [board.id, rf]);

  const showMain = () =>
    rf.fitView({
      nodes: mainThread(board).map((t) => ({ id: t.id })),
      padding: 0.15,
      maxZoom: 1,
      duration: 450,
    });

  const hasOffsets = Object.keys(board.offsets).length > 0;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onPaneClick={() => select(null)}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll
      zoomOnPinch
      minZoom={0.15}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      deleteKeyCode={null}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--grid)" />
      <Panel position="top-right" className="flex gap-1.5">
        <button className="toolbar-btn" onClick={showMain} title="Return to the main thread">
          ↩ Main thread
        </button>
        <button className="toolbar-btn" onClick={() => rf.fitView({ padding: 0.15, duration: 450 })}>
          Fit all
        </button>
        {hasOffsets && (
          <button className="toolbar-btn" onClick={tidy} title="Undo manual moves">
            Tidy
          </button>
        )}
      </Panel>
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        nodeColor={(n) => colors[n.id] ?? "#999"}
        nodeBorderRadius={8}
        maskColor="var(--minimap-mask)"
        style={{ background: "var(--surface)" }}
      />
      <SelectionBranch />
    </ReactFlow>
  );
}
