"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { branchOnPassage } from "@/lib/actions";

type Pending = { turnId: string; text: string; x: number; y: number };

/** Highlight any passage of an answer to open a branch about just that passage. */
export function SelectionBranch() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    const onUp = () => {
      // Wait a tick so the selection reflects this mouseup.
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";
        if (!sel || sel.rangeCount === 0 || text.length < 2) return setPending(null);
        const range = sel.getRangeAt(0);
        const host = (range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement
        )?.closest<HTMLElement>("[data-answer-of]");
        if (!host) return setPending(null);
        const rect = range.getBoundingClientRect();
        setPending({ turnId: host.dataset.answerOf!, text, x: rect.left + rect.width / 2, y: rect.top });
      }, 0);
    };
    const onScroll = () => setPending(null);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("wheel", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("wheel", onScroll);
    };
  }, []);

  if (!pending) return null;

  return createPortal(
    <button
      className="sel-btn"
      style={{ left: pending.x, top: pending.y }}
      onMouseDown={(e) => e.preventDefault()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={() => {
        branchOnPassage(pending.turnId, pending.text.slice(0, 1200));
        window.getSelection()?.removeAllRanges();
        setPending(null);
      }}
    >
      → Branch on this
    </button>,
    document.body,
  );
}
