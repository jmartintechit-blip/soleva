<p align="center"><img src="src/lib/assets/favicon.svg" width="88" alt="Soleva logo"></p>

<h1 align="center">Soleva</h1>

<p align="center">Your net worth on autopilot. No bank connection.</p>

<p align="center">
  <a href="https://github.com/jmartintechit-blip/soleva/actions/workflows/ci.yml"><img src="https://github.com/jmartintechit-blip/soleva/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/jmartintechit-blip/soleva/releases"><img src="https://img.shields.io/github/v/release/jmartintechit-blip/soleva?include_prereleases&label=version" alt="Version"></a>
</p>

<p align="center"><a href="README.md">Español</a></p>

You note once how your money comes in and goes out (salary, contributions, fixed expenses) and Soleva proposes your balances every month and shows where you will be in 5, 10 or 20 years. Built for young investors in Spain with several accounts, funds or brokers. The app is in Spanish.

> Soleva does not move money, does not connect to your bank and does not recommend products. Every projection is an estimate, not advice.

<p align="center"><img src="docs/portada.png" width="280" alt="Soleva home page on mobile"></p>

## Features

Today (blocks 0 to 3):

- Public home page with a compound interest calculator in today's euros (3, 6 and 8 % scenarios, 2.5 % inflation).
- Waitlist with consent and email double opt-in (ready, still closed).
- Legal notice, terms of use and privacy policy.
- Passwordless sign-in with a 6-digit code by email.
- Private routes behind a session, bottom navigation on mobile and a sidebar on desktop.
- Accounts and rules: create, edit, pause, archive and delete; a New rule sheet with templates.
- Rules and month-by-month projection engine by scenario, with invariant tests (the projection screen comes in block 4).
- Horizonte dark design system with self-hosted fonts.

Coming (MVP v0): accounts, income, expense and transfer rules, a one-minute month close, 5, 10 and 20-year projections with three scenarios, an on-track signal against your plan, data export and account deletion.

## Stack

TypeScript · SvelteKit 3 + Svelte 5 · Cloudflare Workers · Neon Postgres (Frankfurt) with hand-written SQL · Better Auth · Resend · Zod · Vitest + PGlite · Playwright.

Details in [ARCHITECTURE.md](ARCHITECTURE.md) (Spanish).

## Run it locally

You need Node 24 and a [Neon](https://neon.tech) database (free).

```bash
npm ci
cp .dev.vars.example .dev.vars   # the app: DATABASE_URL and BETTER_AUTH_SECRET
cp .env.example .env             # the scripts: DATABASE_URL
npm run migrate
npm run dev
```

- `BETTER_AUTH_SECRET`: a random string of 32 characters or more (`openssl rand -base64 32`).
- `WAITLIST_OPEN=1` shows the waitlist form (still off in production).
- `ALLOWED_EMAILS`: comma-separated emails that may sign in (empty = nobody; sign-up is closed until the beta).
- Without `RESEND_API_KEY`, the sign-in code is printed in the `npm run dev` console.
- `npm test` needs no keys: it uses in-memory Postgres (PGlite).
- `npm run check` runs lint, types, format, tests and build, like CI.
- `npm run e2e` tests sign-in, the waitlist and the calculator with Playwright against the `.env` branch (with `delivered@resend.dev` in `ALLOWED_EMAILS`); CI runs it on a throwaway Neon branch copied from dev.

## Status

Under construction: blocks 0 to 3 of 7 of MVP v0 done (v0.4.0), deployed with sign-up and the waitlist closed. See [CHANGELOG.md](CHANGELOG.md).

## Roadmap

| Block                   | Scope                                                       |
| ----------------------- | ----------------------------------------------------------- |
| 0 · Skeleton            | Sign-in, design, database, security, CI and deploy          |
| 1 · Public site         | Landing page, compound interest calculator and waitlist     |
| 2 · Engine              | Rules, month close and projection as pure, tested functions |
| 3 · Accounts and rules  | Create, edit, pause and delete                              |
| 4 · Home and projection | Net worth, chart and editable assumptions                   |
| 5 · Month close         | Proposal, correction, confirmation and history              |
| 6 · Settings            | Themes, data export and account deletion                    |
| 7 · Polish              | Accessibility, performance and installable app              |

## Security

See [SECURITY.md](SECURITY.md) (Spanish) to report a vulnerability.

## Licence

© 2026 Juan Antonio Martín Nadales. All rights reserved. The code is public so it can be read; see [LICENSE](LICENSE).

Built with AI assistance.
