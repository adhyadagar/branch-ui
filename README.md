# Branch

A canvas for talking to AI the way you actually think: in branches, not one endless scroll.

- **Every turn is a card.** A question and its answer.
- **↓ Follow up** continues the thread *downward*, in the same column.
- **→ Branch** opens a side question in a *new column to the right*.
- **Highlight any passage** in an answer → "Branch on this" asks about just that bit.
- **Branch ideas**: the model suggests up to 3 directions; click one to explore it as a branch.
- **Scoped context**: a card only sees the path from the root to itself. Tangents never pollute the main thread.
- **↩ Main thread** jumps back to where you started; the sidebar outline lists every branch.
- Collapse finished branches, drag cards (subtrees move with them), **Tidy** to reset.
- Boards are saved in your browser (localStorage).

## Run

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY (or AI_GATEWAY_API_KEY)
npm install
npm run dev
```

Without a key it runs in demo mode with placeholder answers, so you can try the canvas.

## Where things live

| File | What it does |
| --- | --- |
| `src/lib/layout.ts` | "Threads go down, branches go right" layout (per-column skyline, no overlaps) |
| `src/lib/ask.ts` | Builds root→card context and streams the answer into the card |
| `src/app/api/chat/route.ts` | Model call (AI SDK `streamText`) + demo mode |
| `src/lib/store.ts` | Boards / turns state (zustand, persisted) |
| `src/components/TurnNode.tsx` | The card |
| `src/components/Canvas.tsx` | React Flow canvas, edges, camera |
| `src/components/SelectionBranch.tsx` | Highlight-to-branch popover |
