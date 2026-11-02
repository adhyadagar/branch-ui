"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from "react";
import type { Board } from "@/lib/types";
import { useStore } from "@/lib/store";
import { addNote, ask, endAsk, moveCard, moveNote, openChat, closeChat, resizeItem, select, slotFor, STARTERS, clearQuote } from "@/lib/actions";
import { childrenOf, descendantIds, pathTo, visibleTurns } from "@/lib/tree";
import { CARD_W, edgePath, layoutBoard, MIN_CARD, SLOT_ID, widthOf, type Positions, type Slot } from "@/lib/layout";
import { threadColors } from "@/lib/colors";
import { afterLayout, consumeGlide, fit, flushAfterLayout, getCamera, notifyPlaced, prefersReducedMotion, relayout, scene, setCamera, setRelayout, stopCamera, subscribeCamera, zoomAt } from "@/lib/view";
import { Card } from "./Card";
import { NoteCard } from "./NoteCard";
import { PromptBar } from "./PromptBar";
import { SelectionBranch } from "./SelectionBranch";
import { BoardPill, Outline, Rail, Toast, ViewPill, ZoomPill } from "./Chrome";

const GLIDE_MS = 420;
const FAR_ZOOM = 0.5;
const TIPS_Y = -150;
const TIPS = [
  { x: 0, title: "Click a card", text: "It lights up the path the model would see. Other branches stay out." },
  { x: 340, title: "Highlight to branch", text: "Select text in any answer, then branch on just that passage." },
  { x: 680, title: "Open as a chat", text: "The arrows beside a card's label open that path as a normal conversation." },
];

type Gesture =
  | { kind: "pan"; x: number; y: number; camX: number; camY: number; moved: boolean }
  | { kind: "drag"; id: string; isNote: boolean; x: number; y: number; alone: boolean; moved: boolean }
  | { kind: "resize"; id: string; isNote: boolean; x: number; y: number; w: number; h: number; moved: boolean };

export function Canvas({ board }: { board: Board }) {
  const selectedId = useStore((s) => s.selectedId);
  const asking = useStore((s) => s.asking);
  const askMode = useStore((s) => s.askMode);
  const quote = useStore((s) => s.quote);
  const tool = useStore((s) => s.tool);
  const tipsHidden = useStore((s) => s.tipsHidden);
  const expanded = useStore((s) => s.expanded);
  const menuId = useStore((s) => s.menuId);
  const editNoteId = useStore((s) => s.editNoteId);

  const stageRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const edgesRef = useRef<SVGSVGElement>(null);
  const latest = useRef<{ board: Board; slot: Omit<Slot, "height"> | null }>({ board, slot: null });
  const runLayout = useRef<(animate: boolean) => void>(() => {});
  const gesture = useRef<Gesture | null>(null);
  const justDragged = useRef(false);

  const slot = useMemo(() => slotFor({ asking, quote, selectedId, askMode }, board), [asking, quote, selectedId, askMode, board]);
  const turns = useMemo(() => visibleTurns(board), [board]);
  const colors = useMemo(() => threadColors(board), [board]);
  const path = useMemo(() => (selectedId && board.turns[selectedId] ? new Set(pathTo(board, selectedId).map((t) => t.id)) : null), [board, selectedId]);
  const isEmpty = board.rootIds.length === 0 && board.notes.length === 0;
  const showTips = !tipsHidden && board.rootIds.length > 0;

  // Camera → DOM, outside React so panning never re-renders the cards.
  useLayoutEffect(() => {
    const apply = () => {
      const cam = getCamera();
      const world = worldRef.current!;
      const stage = stageRef.current!;
      world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
      world.style.setProperty("--inv", Math.min(1 / cam.s, 3).toFixed(3));
      world.style.setProperty("--pinv", Math.min(1 / cam.s, 1.7).toFixed(3));
      world.classList.toggle("far", cam.s < FAR_ZOOM);
      let grid = 24;
      while (grid * cam.s < 14) grid *= 2;
      stage.style.setProperty("--g", `${grid * cam.s}px`);
      stage.style.setProperty("--gx", `${cam.x}px`);
      stage.style.setProperty("--gy", `${cam.y}px`);
    };
    apply();
    return subscribeCamera(apply);
  }, []);

  // Layout → DOM, also outside React, so a glide can run at full frame rate.
  useLayoutEffect(() => {
    const world = worldRef.current!;
    const edges = edgesRef.current!;
    let tweening = false;

    const place = (map: Positions) => {
      const b = latest.current.board;
      world.querySelectorAll<HTMLElement>("[data-item]").forEach((el) => {
        const p = map[el.dataset.item!];
        if (p) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      });
      edges.querySelectorAll<SVGPathElement>("path").forEach((line) => {
        const { child, parent, kind } = line.dataset;
        const a = map[parent!];
        const c = map[child!];
        if (!a || !c) return;
        const box = (id: string, p: { x: number; y: number }) => ({ ...p, w: widthOf(b, id), h: scene.heights[id] ?? 170 });
        line.setAttribute("d", edgePath(b.mode, kind as "followup" | "branch", box(parent!, a), box(child!, c)));
      });
      scene.shown = map;
      notifyPlaced();
    };

    runLayout.current = (animate) => {
      const { board: b, slot: s } = latest.current;
      scene.heights[SLOT_ID] = scene.slotHeight;
      const slotEl = world.querySelector<HTMLElement>(`[data-item="${SLOT_ID}"]`);
      if (slotEl) slotEl.style.height = `${scene.slotHeight}px`;
      scene.positions = layoutBoard(b, scene.heights, s ? { ...s, height: scene.slotHeight } : null);
      if (tweening) return; // The running glide reads the new targets on its next frame.
      if (!animate || prefersReducedMotion() || !Object.keys(scene.shown).length) return place(scene.positions);
      const from = scene.shown;
      const t0 = performance.now();
      tweening = true;
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / GLIDE_MS);
        const e = 1 - Math.pow(1 - k, 3);
        const to = scene.positions;
        const frame: Positions = {};
        for (const id in to) {
          const f = from[id] ?? to[id];
          frame[id] = { x: f.x + (to[id].x - f.x) * e, y: f.y + (to[id].y - f.y) * e };
        }
        place(frame);
        if (k < 1) requestAnimationFrame(step);
        else tweening = false;
      };
      requestAnimationFrame(step);
    };
    setRelayout(() => runLayout.current(false));
  }, []);

  // Cards change height as answers stream in and fonts load.
  const observer = useRef<ResizeObserver | null>(null);
  const observed = useRef(new WeakSet<Element>());
  useEffect(() => {
    observer.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const id = el.dataset.item;
        if (id && el.classList.contains("card") && scene.heights[id] !== el.offsetHeight) {
          scene.heights[id] = el.offsetHeight;
          changed = true;
        }
      }
      if (changed) relayout();
    });
    return () => observer.current?.disconnect();
  }, []);

  useLayoutEffect(() => {
    scene.shown = {};
    afterLayout(() => fit());
  }, [board.id]);

  useEffect(() => {
    // Measurements taken before the web font arrives are slightly off.
    document.fonts?.ready.then(() => {
      relayout();
      fit();
    });
  }, []);

  // After every commit: measure, lay out, then run camera moves that were waiting for fresh positions.
  useLayoutEffect(() => {
    latest.current = { board, slot };
    scene.widthOf = (id) => widthOf(latest.current.board, id);
    scene.extraBounds = showTips ? { minY: TIPS_Y - 6, maxX: TIPS[TIPS.length - 1].x + 310 } : null;
    worldRef.current!.querySelectorAll<HTMLElement>("[data-item]").forEach((el) => {
      const id = el.dataset.item!;
      if (id !== SLOT_ID) scene.heights[id] = el.offsetHeight;
      if (el.classList.contains("card") && !observed.current.has(el)) {
        observer.current?.observe(el);
        observed.current.add(el);
      }
    });
    runLayout.current(consumeGlide());
    flushAfterLayout();
  });

  /* ---------- Pointer: pan, drag, resize ---------- */

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    if (e.button !== 0 || target.closest(".float, button, textarea")) return;
    stopCamera();
    const grip = target.closest<HTMLElement>("[data-grip]");
    const item = target.closest<HTMLElement>(".card, .note");
    const cam = getCamera();
    if (tool === "select" && grip) {
      const el = target.closest<HTMLElement>("[data-item]")!;
      gesture.current = { kind: "resize", id: grip.dataset.grip!, isNote: el.classList.contains("note"), x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight, moved: false };
    } else if (tool === "select" && item) {
      if (target.closest("[data-answer-of]")) return; // Let the text be selected.
      gesture.current = { kind: "drag", id: item.dataset.item!, isNote: item.classList.contains("note"), x: e.clientX, y: e.clientY, alone: e.altKey, moved: false };
    } else {
      gesture.current = { kind: "pan", x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y, moved: false };
      stageRef.current!.classList.add("panning");
    }
  };

  useEffect(() => {
    const onMove = (e: globalThis.PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      g.moved = true;
      const cam = getCamera();
      if (g.kind === "pan") {
        setCamera({ ...cam, x: g.camX + dx, y: g.camY + dy });
      } else if (g.kind === "resize") {
        const minW = g.isNote ? 100 : MIN_CARD.w;
        const minH = g.isNote ? 80 : MIN_CARD.h;
        resizeItem(g.id, Math.max(minW, g.w + dx / cam.s), Math.max(minH, g.h + dy / cam.s));
      } else {
        g.x = e.clientX;
        g.y = e.clientY;
        worldRef.current?.querySelector(`[data-item="${g.id}"]`)?.classList.add("dragging");
        if (g.isNote) moveNote(g.id, dx / cam.s, dy / cam.s);
        else moveCard(g.id, dx / cam.s, dy / cam.s, g.alone);
      }
    };
    const onUp = () => {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      stageRef.current?.classList.remove("panning");
      if (g.kind === "pan") {
        if (!g.moved) {
          useStore.setState({ menuId: null });
          select(null);
        }
      } else if (g.moved) {
        if (g.kind === "drag") worldRef.current?.querySelector(`[data-item="${g.id}"]`)?.classList.remove("dragging");
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 0);
      }
    };
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onUp);
    return () => {
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current!;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".float")) return;
      const scroller = target.closest(".c-body");
      if (!e.ctrlKey && !e.metaKey && scroller && scroller.scrollHeight > scroller.clientHeight) return;
      e.preventDefault();
      stopCamera();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      else {
        const cam = getCamera();
        setCamera({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY });
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = !!target.closest?.("textarea, input");
      const s = useStore.getState();
      if (e.key === "Escape") {
        if (s.asking) {
          endAsk();
          target.blur?.();
        } else if (s.quote) clearQuote();
        else if (s.chatId) closeChat();
        else if (s.menuId) useStore.setState({ menuId: null });
        else if (typing) target.blur();
        else select(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || s.chatId) return;
      const key = e.key.toLowerCase();
      if (key === "v") useStore.setState({ tool: "select" });
      else if (key === "h") useStore.setState({ tool: "hand" });
      else if (key === "n") {
        e.preventDefault();
        addNote();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const onClick = (e: MouseEvent) => {
    if (justDragged.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, textarea, .float")) return;
    if (menuId) useStore.setState({ menuId: null });
    const card = target.closest<HTMLElement>(".card");
    if (card && !getSelection()?.toString().trim()) select(card.dataset.item!);
  };

  const onDoubleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, textarea, .float, [data-answer-of]")) return;
    const card = target.closest<HTMLElement>(".card");
    const note = target.closest<HTMLElement>(".note");
    if (card) openChat(card.dataset.item!);
    else if (note) useStore.setState({ editNoteId: note.dataset.note! });
  };

  return (
    <>
      <main className={`stage ${tool === "hand" ? "tool-hand" : ""}`} ref={stageRef} onPointerDown={onPointerDown} onClick={onClick} onDoubleClick={onDoubleClick}>
        <div className="world" ref={worldRef}>
          {showTips && (
            <div className="annot">
              {TIPS.map((t, i) => (
                <div className="tip" key={t.title} style={{ left: t.x, top: TIPS_Y }}>
                  <span className="num">{i + 1}</span>
                  <b>{t.title}</b>
                  <p>{t.text}</p>
                  {i === TIPS.length - 1 && (
                    <button className="hide" onClick={() => useStore.setState({ tipsHidden: true })}>
                      Hide these tips
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <svg className="edges" ref={edgesRef} aria-hidden="true">
            {turns.map((t) => {
              if (!t.parentId) return null;
              const on = !!path?.has(t.id);
              return (
                <path
                  key={t.id}
                  data-child={t.id}
                  data-parent={t.parentId!}
                  data-kind={t.kind}
                  style={{ ["--c" as string]: colors[t.id] }}
                  className={`${t.status === "streaming" ? "flow" : ""} ${on ? "on" : path ? "dim" : ""}`}
                />
              );
            })}
            {slot && <path data-child={SLOT_ID} data-parent={slot.parentId} data-kind={slot.kind} style={{ ["--c" as string]: "var(--blue)" }} className="ghost-edge on" />}
          </svg>
          <div>
            {board.notes.map((n) => (
              <NoteCard key={n.id} note={n} editing={editNoteId === n.id} />
            ))}
          </div>
          <div>
            {turns.map((t) => {
              const kids = childrenOf(board, t.id);
              const collapsed = !!board.collapsed[t.id];
              return (
                <Card
                  key={t.id}
                  turn={t}
                  boardId={board.id}
                  color={colors[t.id]}
                  sees={pathTo(board, t.id).length - 1}
                  childCount={kids.length}
                  hasFollowup={kids.some((k) => k.kind === "followup")}
                  childQuestions={kids.map((k) => k.question).join("\n")}
                  hiddenCount={collapsed ? descendantIds(board, t.id).length : 0}
                  collapsed={collapsed}
                  expanded={!!expanded[t.id]}
                  width={board.sizes[t.id]?.w ?? CARD_W}
                  height={board.sizes[t.id]?.h ?? null}
                  selected={t.id === selectedId}
                  onPath={!!path?.has(t.id)}
                  dimmed={!!path && !path.has(t.id)}
                  menuOpen={menuId === t.id}
                />
              );
            })}
            {slot && <article className="card slot" data-item={SLOT_ID} aria-hidden="true" style={{ width: CARD_W }} />}
          </div>
        </div>

        {isEmpty && (
          <div className="float empty">
            <h1>What do you want to explore?</h1>
            <p>Ask anything in the bar below, or start from one of these.</p>
            <div className="chips">
              {STARTERS.map((q) => (
                <button key={q} className="chip" onClick={() => ask(q)}>
                  <span className="arr">→</span>
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <BoardPill board={board} />
        <ViewPill board={board} />
        <Rail />
        <Outline board={board} colors={colors} />
        <ZoomPill />
      </main>
      <PromptBar />
      <SelectionBranch />
      <Toast />
    </>
  );
}
