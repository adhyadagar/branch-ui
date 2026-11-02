"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { getActiveBoard, useActiveBoard, useStore } from "@/lib/store";
import { ask, beginAsk, clearQuote, endAsk, select, setAskMode } from "@/lib/actions";
import { chainThrough, followupOf, shortLabel } from "@/lib/tree";
import { CARD_W, SLOT_ID } from "@/lib/layout";
import { isExampleBoard } from "@/lib/sample";
import { ConnectNote } from "./ConnectDialog";
import { getCamera, prefersReducedMotion, relayout, scene, setFocusBar, SLOT_ZOOM, subscribeCamera, subscribePlaced } from "@/lib/view";

const QUICK = ["Explain this more simply", "Give me a concrete example", "Why is this true?"];
const HOME_W = 640;
const GLIDE_MS = 320;

type Placed = { x: number; y: number; w: number };

/**
 * One prompt bar. Its home is bottom-center, and reading a card never moves it. When
 * you're about to ask, it moves into the slot where the answer will land, so the
 * answer appears right where you were looking.
 */
export function PromptBar() {
  const board = useActiveBoard();
  const text = useStore((s) => s.barText);
  const asking = useStore((s) => s.asking);
  const quote = useStore((s) => s.quote);
  const chatId = useStore((s) => s.chatId);
  const askMode = useStore((s) => s.askMode);
  const barFade = useStore((s) => s.barFade);
  const selectedId = useStore((s) => s.selectedId);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const placed = useRef<Placed | null>(null);
  const glide = useRef<(Placed & { t0: number }) | null>(null);
  const glideFrame = useRef(0);
  const lastAsking = useRef(false);
  const lastFade = useRef(barFade);

  // Runs for every camera frame, so it reads state directly instead of re-rendering.
  const positionRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    positionRef.current = () => {
      const el = rootRef.current;
      if (!el) return;
      const s = useStore.getState();
      const cam = getCamera();
      const vw = innerWidth;
      const vh = innerHeight;
      let w = Math.min(HOME_W, vw - 32);
      let x: number | null = null;
      let y = 0;
      const anchored = s.asking && !s.chatId && vw > 760;
      if (anchored) {
        w = Math.max(CARD_W * cam.s, 340);
        const slot = scene.shown[SLOT_ID] ?? scene.positions[SLOT_ID];
        if (slot) {
          x = cam.x + slot.x * cam.s;
          y = cam.y + slot.y * cam.s;
        }
      }
      el.classList.toggle("anchored", anchored);

      const g = glide.current;
      let k = 1;
      if (g) {
        k = Math.min(1, (performance.now() - g.t0) / GLIDE_MS);
        k = 1 - Math.pow(1 - k, 3);
      }
      const shownW = g ? g.w + (w - g.w) * k : w;
      el.style.width = `${shownW}px`;
      const h = el.offsetHeight;
      if (x === null) {
        x = (vw - w) / 2;
        y = vh - 14 - h;
      }
      x = Math.max(8, Math.min(x, vw - w - 8));
      y = Math.max(8, Math.min(y, vh - h - 8));
      if (g) {
        x = g.x + (x - g.x) * k;
        y = g.y + (y - g.y) * k;
        if (k >= 1) glide.current = null;
      }
      el.style.transform = `translate(${x}px, ${y}px)`;
      placed.current = { x, y, w: shownW };

      // Keep the slot exactly as tall as the bar, once the bar has settled at its final width.
      if (s.asking && !glide.current) {
        const slotH = h / Math.min(1, Math.max(cam.s, SLOT_ZOOM));
        if (Math.abs(slotH - scene.slotHeight) > 0.5) {
          scene.slotHeight = slotH;
          relayout();
        }
      }
    };
  }, []);

  useEffect(() => {
    const run = () => positionRef.current();
    const offCamera = subscribeCamera(run);
    const offPlaced = subscribePlaced(run);
    addEventListener("resize", run);
    setFocusBar(() => inputRef.current?.focus({ preventScroll: true }));
    return () => {
      offCamera();
      offPlaced();
      removeEventListener("resize", run);
    };
  }, []);

  // Glide when the bar leaves home or comes back. After a send the bar has just become
  // the card, so it fades back in at home instead of flying across the board.
  useLayoutEffect(() => {
    const sent = barFade !== lastFade.current;
    const moved = asking !== lastAsking.current;
    lastFade.current = barFade;
    lastAsking.current = asking;
    if (sent) {
      glide.current = null;
      inputRef.current?.blur();
      const el = rootRef.current;
      el?.classList.add("fading");
      setTimeout(() => el?.classList.remove("fading"), 450);
    } else if (moved && placed.current && !prefersReducedMotion()) {
      glide.current = { ...placed.current, t0: performance.now() };
      const loop = () => {
        positionRef.current();
        if (glide.current) glideFrame.current = requestAnimationFrame(loop);
      };
      cancelAnimationFrame(glideFrame.current);
      glideFrame.current = requestAnimationFrame(loop);
    }
    positionRef.current();
  });

  // Grow with the text, and let the slot follow.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
    positionRef.current();
  }, [text]);

  const target = chatId && board?.turns[chatId] ? (chainThrough(board, chatId).at(-1)?.id ?? null) : selectedId && board?.turns[selectedId] ? selectedId : null;
  const hasFollowup = !!(board && target && followupOf(board, target));
  const mode = hasFollowup ? "branch" : askMode;

  let context;
  let placeholder;
  if (quote) {
    context = (
      <>
        <span className="from">
          About: <strong>“{shortLabel(quote.text, 70)}”</strong>
        </span>
        <button type="button" className="x" onClick={clearQuote} aria-label="Remove the highlighted passage">
          ✕
        </button>
      </>
    );
    placeholder = "Ask about this passage…";
  } else if (chatId && board) {
    const n = chainThrough(board, chatId).length;
    context = (
      <span className="from">
        Continues this conversation. The model sees these <strong>{n === 1 ? "1 card" : `${n} cards`}</strong>.
      </span>
    );
    placeholder = "Reply…";
  } else if (target && board) {
    context = (
      <>
        <span className="from">
          {!asking && (
            <>
              From: <strong>{shortLabel(board.turns[target].question, 44)}</strong>
            </>
          )}
        </span>
        <div className="seg" role="group" aria-label="Where the answer goes">
          <button type="button" aria-pressed={mode === "follow"} disabled={hasFollowup} title={hasFollowup ? "This thread already continues. Use a branch." : undefined} onClick={() => setAskMode("follow")}>
            ↓ Follow up
          </button>
          <button type="button" aria-pressed={mode === "branch"} onClick={() => setAskMode("branch")}>
            → Branch
          </button>
        </div>
        <button type="button" className="x" onClick={() => (asking ? endAsk() : select(null))} aria-label={asking ? "Cancel" : "Start a new topic instead"}>
          ✕
        </button>
      </>
    );
    placeholder = mode === "follow" ? "Continue this thread…" : "Ask a side question…";
  } else {
    context = (
      <span className="from">
        Nothing selected, so this starts a {board && isExampleBoard(board) ? <strong>new board</strong> : <><strong>new topic</strong> on the board</>}.
      </span>
    );
    placeholder = "What do you want to explore?";
  }

  const send = () => {
    if (text.trim()) ask(text);
  };

  return (
    <div className="composer" ref={rootRef}>
      {quote && (
        <div className="comp-quick">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => ask(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
      <div className="comp-box">
        {!asking && <ConnectNote />}
        <div className="comp-ctx">{context}</div>
        <form
          className="comp-form"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            id="askInput"
            rows={1}
            value={text}
            placeholder={placeholder}
            aria-label="Your question"
            onChange={(e) => useStore.setState({ barText: e.target.value })}
            onFocus={() => {
              const s = useStore.getState();
              if (!s.asking && !s.chatId && s.selectedId && getActiveBoard()?.turns[s.selectedId]) beginAsk(s.selectedId, s.askMode);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="send" type="submit" aria-label="Ask" disabled={!text.trim()}>
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
