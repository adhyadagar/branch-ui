"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Board, Note } from "@/lib/types";
import { useStore } from "@/lib/store";
import { closeThreads, goToAnnotation, goToBoardNote, goToCard, goToMatch, goToThread, openChat } from "@/lib/actions";
import { whenWritten } from "@/lib/annotations";
import { clearCardMarks, passageInContext, searchTerms, searchThreads, termPattern } from "@/lib/search";
import { listThreads, shortLabel, type Thread } from "@/lib/tree";
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

const matchesTerms = (text: string, terms: string[]) => terms.every((t) => text.toLowerCase().includes(t));

/** Notes that aren't stuck to anything, in the same paper they have on the board. */
function BoardNotes({ notes, terms }: { notes: Note[]; terms: string[] }) {
  if (!notes.length) return null;
  return (
    <section className="r-group">
      <p className="r-label">On the board</p>
      {notes.map((note) => (
        <button
          key={note.id}
          className="r-paper"
          data-row
          style={{ ["--n" as string]: note.color }}
          onClick={() => {
            goToBoardNote(note.id);
            closeOnPhone();
          }}
        >
          {terms.length ? <Marked text={note.text} terms={terms} /> : note.text}
        </button>
      ))}
    </section>
  );
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
  const tab = useStore((s) => s.panelTab);
  const setTab = (panelTab: typeof tab) => useStore.setState({ panelTab });
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const terms = useMemo(() => searchTerms(query), [query]);
  const threads = useMemo(() => listThreads(board), [board]);
  const results = useMemo(() => (tab === "threads" && terms.length ? searchThreads(threads, terms, board.annotations) : null), [tab, threads, terms, board]);
  const matchCount = results?.reduce((n, r) => n + r.hits.length, 0) ?? 0;

  // In the order of the board, so reading them follows the way you went.
  const noteGroups = useMemo(() => {
    const kept = board.annotations.filter((a) => a.text.trim() || a.quote);
    return threads
      .map((thread) => ({ thread, notes: thread.cards.flatMap((c) => kept.filter((a) => a.turnId === c.id && matchesTerms(`${a.text}\n${a.quote ?? ""}`, terms))) }))
      .filter((g) => g.notes.length);
  }, [threads, board, terms]);
  const boardNotes = board.notes.filter((n) => matchesTerms(n.text, terms));
  const noteCount = board.annotations.filter((a) => a.text.trim() || a.quote).length + board.notes.length;
  const shownNotes = noteGroups.reduce((n, g) => n + g.notes.length, 0) + boardNotes.length;

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
    const inThreads = `${matchCount === 1 ? "1 card" : `${matchCount} cards`} in ${results.length === 1 ? "1 thread" : `${results.length} threads`}`;
    const loose = boardNotes.length === 1 ? "1 note on the board" : `${boardNotes.length} notes on the board`;
    if (results.length) summary = boardNotes.length ? `${inThreads}, and ${loose}` : inThreads;
    else summary = boardNotes.length ? loose : `Nothing on this board matches “${query.trim()}”.`;
  } else if (tab === "notes" && terms.length) {
    summary = shownNotes ? `${shownNotes} found` : `None of your highlights or notes match “${query.trim()}”.`;
  }

  return (
    <div className="float threads-panel" onKeyDown={onKeyDown}>
      <div className="t-head">
        <div className="seg" role="group" aria-label="Show">
          <button aria-pressed={tab === "threads"} onClick={() => setTab("threads")}>
            Threads <span className="count">{threads.length}</span>
          </button>
          <button aria-pressed={tab === "notes"} onClick={() => setTab("notes")}>
            Highlights & notes <span className="count">{noteCount}</span>
          </button>
        </div>
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
          placeholder={tab === "threads" ? "Search questions, answers and notes" : "Search highlights and notes"}
          aria-label={tab === "threads" ? "Search this board's threads" : "Search your highlights and notes"}
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
      <nav className="t-list" ref={listRef} aria-label={tab === "notes" ? "Your highlights and notes" : results ? "Search results" : "Threads on this board"}>
        {tab === "notes" && (
          <>
            {noteGroups.map(({ thread, notes }) => (
              <section key={thread.start.id} className="r-group" style={{ ["--c" as string]: colors[thread.start.id] }}>
                <button className="r-thread" title={thread.start.question} onClick={() => goToThread(thread.start.id)}>
                  <span className="o-sq" />
                  <span>{thread.start.question}</span>
                </button>
                {notes.map((note) => {
                  const context = note.quote && board.turns[note.turnId] ? passageInContext(board.turns[note.turnId].answer, note.quote) : null;
                  return (
                    <button
                      key={note.id}
                      className={`r-hit ${note.turnId === selectedId ? "active" : ""}`}
                      data-row
                      onClick={() => {
                        goToAnnotation(note.id);
                        closeOnPhone();
                      }}
                    >
                      {note.quote && (
                        <span className="r-quote">
                          {context?.before}
                          <mark>{context?.quote ?? shortLabel(note.quote, 110)}</mark>
                          {context?.after}
                        </span>
                      )}
                      {note.text.trim() && (
                        <span className="r-note">
                          <Marked text={note.text} terms={terms} />
                        </span>
                      )}
                      <span className="t-meta">{whenWritten(note.createdAt)}</span>
                    </button>
                  );
                })}
              </section>
            ))}
            <BoardNotes notes={boardNotes} terms={terms} />
            {!noteCount && <p className="outline-empty">Select some words in an answer to highlight them or add a note, or press Note on a card. Everything you mark collects here.</p>}
          </>
        )}
        {tab === "threads" &&
          (results
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
            : threads.map((t) => <ThreadRow key={t.start.id} thread={t} color={colors[t.start.id]} selectedId={selectedId} />))}
        {tab === "threads" && results && <BoardNotes notes={boardNotes} terms={terms} />}
        {tab === "threads" && !threads.length && <p className="outline-empty">Threads you start will be listed here.</p>}
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
