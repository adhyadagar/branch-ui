# Contributing to Branch

Bug reports, ideas and pull requests are all welcome. For anything bigger than a small fix, open an issue first so we can agree on the approach before you spend time on it.

## Setup

You need Node 22 or later. No API key is required: without one, the app runs in demo mode with placeholder answers, which is enough for most canvas and layout work.

```bash
git clone https://github.com/adhyadagar/branch-ui.git
cd branch-ui
npm install
npm run dev
```

Open <http://localhost:3000>. To test against a real model, see [Use a real model](README.md#use-a-real-model).

## Before you open a pull request

CI runs these three commands, and they should all pass:

```bash
npm run lint
npm run typecheck
npm run build
```

There's no automated test suite yet, so also try your change in the browser and say in the pull request what you checked. Include a screenshot or short clip for anything visual.

Keep each pull request to one change, and match the style of the code around it.

## Good to know

- **Next.js version.** This project uses Next.js 16, which differs from older versions in APIs and file conventions. The docs for the installed version are in `node_modules/next/dist/docs/`.
- **`AGENTS.md`.** `next dev` generates this file for AI coding tools and adds it back if it's removed, so leave it committed.
- **Saved boards.** Boards are stored in the browser's localStorage under the `branch-ui` key. If you change the shape of `Board` or `Turn`, make sure boards saved by earlier versions still load.

## Reporting security issues

Please don't open a public issue for these. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
