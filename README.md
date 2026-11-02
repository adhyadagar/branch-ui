# Branch

A canvas for talking to AI the way you actually think: in branches, not one endless scroll.

![A Branch board with a main thread on the left and two side branches on the right](docs/screenshot.png)

<sub>Shown in demo mode, which gives placeholder answers when no API key is set.</sub>

## What it does

- **Every turn is a card.** A question and its answer.
- **↓ Follow up** continues the thread *downward*, in the same column.
- **→ Branch** opens a side question in a *new column to the right*.
- **Highlight any passage** in an answer → "Branch on this" asks about just that bit.
- **Branch ideas**: the model suggests up to 3 directions; click one to explore it as a branch.
- **Scoped context**: a card only sees the path from the root to itself. Tangents never pollute the main thread.
- **↩ Main thread** jumps back to where you started; the sidebar outline lists every branch.
- Collapse finished branches, drag cards (subtrees move with them), **Tidy** to reset.
- Boards are saved in your browser (localStorage).

## Quick start

You need [Node.js](https://nodejs.org) 22 or later.

```bash
git clone https://github.com/adhyadagar/branch-ui.git
cd branch-ui
npm install
npm run dev
```

Open <http://localhost:3000>. Without an API key it runs in demo mode with placeholder answers, so you can try the canvas right away.

## Use a real model

Create your local settings file:

```bash
cp .env.example .env.local
```

Add one of these keys to `.env.local`, then restart `npm run dev`:

| Variable | Use it for | Default model (override with) |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Calling Anthropic directly | `claude-sonnet-5-5` (`ANTHROPIC_MODEL`) |
| `AI_GATEWAY_API_KEY` | Any provider through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) | `anthropic/claude-sonnet-5.5` (`AI_GATEWAY_MODEL`) |

If both are set, `ANTHROPIC_API_KEY` is used.

## Security and privacy

Branch is built to run on your own machine, for one person.

- Your API key stays on the server and `.env.local` is ignored by git.
- Boards are saved in your browser. What you ask is sent to the model provider you configured, along with the earlier cards on that branch.
- `/api/chat` has no login, so **anyone who can reach it can spend your API credit**. `npm run dev` listens only on `localhost`, but `npm start` listens on all network interfaces. Put authentication in front of it before hosting it anywhere public.

See [SECURITY.md](SECURITY.md) for more, including how to report a vulnerability.

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

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
