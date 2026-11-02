# Branch

A canvas for talking to AI the way you actually think: in branches, not one endless scroll.

![A Branch board with a main thread on the left, two side branches on the right, and the prompt bar waiting where the next answer will appear](docs/screenshot.png)

Chat apps put every question in one line, so a side question buries whatever you were doing and you end up scrolling to find it again. Branch lays the conversation out on a board instead. Side questions open off to the side, and the main thread stays where you left it.

## What it does

- **Every question is a card.** A card shows the question and a short summary. **More** expands the full answer in place.
- **Follow up or branch.** A follow-up continues the thread. A branch opens a side question without disturbing it.
- **Highlight any passage** in an answer to branch on just that passage.
- **Branch ideas.** The model suggests up to 3 directions after an answer, and one click explores any of them.
- **The prompt bar goes where the answer will go.** Press Follow up or Branch and the bar moves into a dashed space below or beside the card, and the answer appears in that same spot. Reading a card never moves it.
- **Scoped context.** A card only sends the model the cards on its own path. Tangents stay out of the main thread, and each card shows how many earlier cards it sees.
- **Open any path as a chat.** The arrows beside a card's label turn that path into a normal linear conversation, with chips to jump to its other branches.
- **Two layouts.** Switch between Threads (follow-ups go down, branches go right) and Mind map (a classic left-to-right tree). Each remembers where you put things.
- **A real board.** Drag cards and whatever branches off them follows; hold Alt or Option to move just one card. Drag a corner to resize, add sticky notes, and turn a note into a new topic. **Tidy up** puts everything back in a clean layout, with an undo.
- **Readable from far away.** Zoomed out, cards switch to large titles, and the outline lists every card.
- **Yours.** Boards are saved in your browser, with as many as you like.

## Quick start

You need [Node.js](https://nodejs.org) 22 or later.

```bash
git clone https://github.com/adhyadagar/branch-ui.git
cd branch-ui
npm install
npm run dev
```

Open <http://localhost:3000>. You start on an example board with real answers already written, so you can explore it right away. Without an API key, new questions get placeholder answers.

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

## Keyboard and mouse

| Do this | To |
| --- | --- |
| Drag the board, or scroll | Pan |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + scroll, or pinch on a trackpad | Zoom |
| Double-click a card | Open it as a chat |
| <kbd>V</kbd> / <kbd>H</kbd> | Select tool / pan tool |
| <kbd>N</kbd> | Add a sticky note |
| <kbd>Esc</kbd> | Cancel the question you were about to ask, or leave the chat |
| <kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd> | Send / new line |

## Where things live

| File | What it does |
| --- | --- |
| `src/lib/layout.ts` | Both layouts, and the curves between cards |
| `src/lib/view.ts` | Camera and card positions, kept outside React so panning stays smooth |
| `src/lib/actions.ts` | Everything the UI can do: asking, drag, tidy up, boards |
| `src/lib/ask.ts` | Builds a card's context from its path and streams the answer into it |
| `src/lib/answer.ts` | Splits model output into summary, body and branch ideas |
| `src/lib/store.ts` | Boards and UI state, saved to localStorage, plus migrations for older boards |
| `src/lib/sample.ts` | The example board |
| `src/app/api/chat/route.ts` | Model call (AI SDK `streamText`) and demo mode |
| `src/components/Canvas.tsx` | The board: pan, zoom, drag, resize and placing cards |
| `src/components/Card.tsx` | A card |
| `src/components/PromptBar.tsx` | The prompt bar and how it moves |
| `src/components/ChatView.tsx` | A path as a linear conversation |

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
