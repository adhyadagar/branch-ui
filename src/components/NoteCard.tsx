"use client";

import { memo } from "react";
import type { Note } from "@/lib/types";
import { askFromNote, deleteNote, saveNoteText } from "@/lib/actions";

export const NoteCard = memo(function NoteCard({ note, editing }: { note: Note; editing: boolean }) {
  return (
    <div className="note" data-item={note.id} data-note={note.id} style={{ ["--n" as string]: note.color, width: note.w, height: note.h }}>
      <div className="n-tools">
        <button onClick={() => askFromNote(note.text)} title="Start a new topic from this note">
          Ask →
        </button>
        <button onClick={() => deleteNote(note.id)}>Delete</button>
      </div>
      {editing ? (
        <textarea
          className="n-edit"
          defaultValue={note.text}
          aria-label="Note text"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => saveNoteText(note.id, e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <div className="n-text">{note.text}</div>
      )}
      <div className="grip" data-grip={note.id} aria-hidden="true" />
    </div>
  );
});
