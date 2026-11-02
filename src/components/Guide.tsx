"use client";

import { useLayoutEffect } from "react";
import type { Board } from "@/lib/types";
import { useStore, type GuideStep } from "@/lib/store";
import { dismissGuide, newBoard } from "@/lib/actions";
import { isExampleBoard } from "@/lib/sample";
import { scene } from "@/lib/view";

const RIGHT_INSET = 304; // The width of .guide, plus its margin and a gap.

const STEPS: { id: GuideStep; title: string; text: string }[] = [
  { id: "select", title: "Click a card", text: "It lights up the path the model would see. Other branches stay out." },
  { id: "branch", title: "Branch on a passage", text: "Select a few words in an answer, press Branch on this, then ask about them." },
  { id: "chat", title: "Open a path as a chat", text: "Press the arrows beside a card's label to read that path as a normal conversation." },
];

/** A first round on the example board: three things to try, then on to a board of your own. */
export function Guide({ board }: { board: Board }) {
  const guide = useStore((s) => s.guide);
  const show = isExampleBoard(board) && !guide.dismissed;

  useLayoutEffect(() => {
    if (!show) return;
    scene.rightInset = RIGHT_INSET;
    return () => {
      scene.rightInset = 0;
    };
  }, [show]);

  if (!show) return null;
  const current = STEPS.find((s) => !guide.done.includes(s.id));

  if (!current) {
    return (
      <section className="float guide" aria-label="Guided tour">
        <h2 className="g-done">Now try your own question</h2>
        <p className="g-text">Start a board for something you&apos;re curious about. This one stays under Boards.</p>
        <div className="g-actions">
          <button
            className="tidy"
            onClick={() => {
              dismissGuide();
              newBoard();
            }}
          >
            Start your own board
          </button>
          <button className="ghost" onClick={dismissGuide}>
            Not yet
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="float guide" aria-label="Guided tour">
      <div className="g-head">
        <h2>Try it</h2>
        <span>
          {guide.done.length + 1} of {STEPS.length}
        </span>
        <button className="g-skip" onClick={dismissGuide}>
          Skip
        </button>
      </div>
      <ol className="g-steps">
        {STEPS.map((step, i) => {
          const done = guide.done.includes(step.id);
          const now = step === current;
          return (
            <li key={step.id} className={`g-step ${done ? "done" : now ? "now" : "next"}`} aria-current={now ? "step" : undefined}>
              <span className="g-num">{done ? "✓" : i + 1}</span>
              <b>{step.title}</b>
              {now && <p className="g-text">{step.text}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
