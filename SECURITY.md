# Security

## Reporting a vulnerability

Please report vulnerabilities privately, using **Report a vulnerability** on the [Security tab](https://github.com/adhyadagar/branch-ui/security) of this repository, rather than in a public issue. Include the steps to reproduce it and what an attacker could do with it.

Only the latest code on `main` is supported.

## What to know when you run Branch

- **A key added in the browser stays in the browser.** It's kept in localStorage and sent only to Anthropic, directly from the page, so it never reaches Branch's server. Anyone who can use that browser profile could read it. The page's Content Security Policy only lets it connect to its own site and to Anthropic, which limits where a script could send the key.
- **A key in `.env.local` stays on the server.** It's never sent to the browser, and the file is ignored by git.
- **`/api/chat` has no login.** If you set a key on a server, anyone who can reach it can spend your API credit. `npm run dev` listens only on `localhost` for this reason, but `npm start` listens on all network interfaces.
- **Hosting it publicly.** Leave `ANTHROPIC_API_KEY` and `AI_GATEWAY_API_KEY` unset, so the server only gives placeholder answers and visitors use their own keys. To host it with your own key, put authentication in front of it first, such as [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection).
- **Where your conversations go.** Boards are saved in your browser's localStorage, not on a server. What you ask is sent to the model provider, along with the earlier cards on that branch. Nothing is sent in demo mode.
