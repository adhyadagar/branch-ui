# Security

## Reporting a vulnerability

Please report vulnerabilities privately, using **Report a vulnerability** on the [Security tab](https://github.com/adhyadagar/branch-ui/security) of this repository, rather than in a public issue. Include the steps to reproduce it and what an attacker could do with it.

Only the latest code on `main` is supported.

## What to know when you run Branch

Branch is built to run on your own machine, for one person.

- **Your API key stays on the server.** It's read from `.env.local`, is never sent to the browser, and is ignored by git.
- **`/api/chat` has no login.** Anyone who can reach it can spend your API credit. `npm run dev` listens only on `localhost` for this reason, but `npm start` listens on all network interfaces.
- **Don't deploy it publicly as is.** If you host it with a real key, put authentication in front of it first, such as [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection).
- **Where your conversations go.** Boards are saved in your browser's localStorage, not on a server. What you ask is sent to the model provider you configured, along with the earlier cards on that branch. Nothing is sent in demo mode.
