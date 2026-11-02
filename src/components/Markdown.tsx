"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const PLUGINS = [remarkGfm];

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={PLUGINS}>{children}</ReactMarkdown>;
});

export function Thinking() {
  return (
    <div className="dots" role="status" aria-label="Thinking">
      <i />
      <i />
      <i />
    </div>
  );
}
