"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Board } from "@/lib/types";
import { useStore } from "@/lib/store";
import { closeThreads, goToCard, goToMatch, goToThread, openChat } from "@/lib/actions";
import { clearCardMarks, searchTerms, searchThreads, termPattern } from "@/lib/search";
import { listThreads, type Thread } from "@/lib/tree";
import { scene } from "@/lib/view";
import { OpenIcon, SearchIcon } from "./icons";

const PANEL_RIGHT = 404; // Where .threads-panel ends, plus a gap.
const MAX_INDENT = 4;
const KIND_LABEL = { root: "Topic", branch: "Branch", followup: "Follow-up" };

const closeOnPhone = () => {
  if (innerWidth <= 760) closeThreads();
};

function Marked({ text, terms }: { text: string; terms: string[] }) {
  return <>{text.split(termPattern(terms)).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

function ThreadRow({ thread, color, selectedId }: { thread: Thread; color: string; selectedId: string | null }) {
  const { start, cards, depth } = thread;
  const active = cards.some((c) => c.id === selectedId);
  return (
    <div style={{ paddingLeft: Math.min(depth, MAX_INDENT) * 12, ["--c" as string]: color }}>
      <div className={`t-row ${active ? "active" : ""}`}>
        <button
          className="t-open"
          data-row
          title={start.question}
          onClick={() => {
            goToThread(start.id);
            closeOnPhone();
          }}
        >
          <span className="o-sq" />
          <span className="t-text">
            <span className="t-q">{start.question}</span>
            <span className="t-meta">
              {KIND_LABEL[start.kind]} · {cards.length === 1 ? "1 card" : `${cards.length} cards`}
            </span>
          </span>
        </button>
        <button className="t-chat" title="Open as a conversation" aria-label={`Open “${start.question}” as a conversation`} onClick={() => openChat(start.id)}>
          <OpenIcon />
        </button>
      </div>
      {active &&
        cards.slice(1).map((card) => (
          <button
            key={card.id}
            className={`o-row t-card ${card.id === selectedId ? "active" : ""}`}
            data-row
            title={card.question}
            onClick={() => {
              goToCard(card.id);
              closeOnPhone();
            }}
          >
            <span className="o-sq hollow" />
            <span>{card.question}</span>
          </button>
        ))}
    </div>
  );
}

function Panel({ board, colors }: { board: Board; colors: Record<string, string> }) {
  const selectedId = useStore((s) => s.selectedId);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const terms = useMemo(() => searchTerms(query), [query]);
  const threads = useMemo(() => listThreads(board), [board]);
  const results = useMemo(() => (terms.length ? searchThreads(threads, terms) : null), [threads, terms]);
  const matchCount = results?.reduce((n, r) => n + r.hits.length, 0) ?? 0;

  useLayoutEffect(() => {
    scene.panelRight = PANEL_RIGHT;
    return () => {
      scene.panelRight = 0;
    };
  }, []);

  useEffect(() => clearCardMarks, [terms]);

  // Clicking a card on the board shows you where it is in the list.
  useEffect(() => {
    listRef.current?.querySelector(".t-row.active")?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const rows = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-row]") ?? [])];

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (query) {
        setQuery("");
        inputRef.current?.focus();
      } else closeThreads();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const list = rows();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      const next = at + (e.key === "ArrowDown" ? 1 : -1);
      if (next < 0) inputRef.current?.focus();
      else list[next]?.focus();
    }
  };

  let summary = null;
  if (results) {
    summary = results.length
      ? `${matchCount === 1 ? "1 card" : `${matchCount} cards`} in ${results.length === 1 ? "1 thread" : `${results.length} threads`}`
      : `Nothing on this board matches “${query.trim()}”.`;
  }

  return (
    <div className="float threads-panel" onKeyDown={onKeyDown}>
      <div className="t-head">
        <h2>Threads</h2>
        <span className="count">{threads.length}</span>
        <button className="x" onClick={closeThreads} aria-label="Close threads">
          ✕
        </button>
      </div>
      <label className="t-search">
        <SearchIcon />
        <input
          ref={inputRef}
          id="threadSearch"
          type="text"
          value={query}
          placeholder="Search questions and answers"
          aria-label="Search this board's threads"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) rows()[0]?.click();
          }}
        />
      </label>
      {summary && (
        <p className="t-summary" role="status">
          {summary}
        </p>
      )}
      <nav className="t-list" ref={listRef} aria-label={results ? "Search results" : "Threads on this board"}>
        {results
          ? results.map(({ thread, hits }) => (
              <section key={thread.start.id} className="r-group" style={{ ["--c" as string]: colors[thread.start.id] }}>
                <button className="r-thread" title={thread.start.question} onClick={() => goToThread(thread.start.id)}>
                  <span className="o-sq" />
                  <span>{thread.start.question}</span>
                </button>
                {hits.map(({ turn, excerpt }) => (
                  <button
                    key={turn.id}
                    className={`r-hit ${turn.id === selectedId ? "active" : ""}`}
                    data-row
                    onClick={() => {
                      goToMatch(turn.id, terms, !!excerpt);
                      closeOnPhone();
                    }}
                  >
                    <span className="r-q">
                      <Marked text={turn.question} terms={terms} />
                    </span>
                    {excerpt && (
                      <span className="r-x">
                        <Marked text={excerpt} terms={terms} />
                      </span>
                    )}
                  </button>
                ))}
              </section>
            ))
          : threads.map((t) => <ThreadRow key={t.start.id} thread={t} color={colors[t.start.id]} selectedId={selectedId} />)}
        {!threads.length && <p className="outline-empty">Threads you start will be listed here.</p>}
      </nav>
    </div>
  );
}

/** Every thread on the board, to go through or search. */
export function ThreadsPanel({ board, colors }: { board: Board; colors: Record<string, string> }) {
  const open = useStore((s) => s.threadsOpen);
  if (!open) return null;
  return <Panel key={board.id} board={board} colors={colors} />;
}
