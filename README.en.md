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

## Features

Today (block 0, skeleton):

- Passwordless sign-in with a 6-digit code by email.
- Private routes behind a session, bottom navigation on mobile and a sidebar on desktop.
- Horizonte dark design system with self-hosted fonts.

Coming (MVP v0): accounts, income, expense and transfer rules, a one-minute month close, 5, 10 and 20-year projections with three scenarios, an on-track signal against your plan, data export and account deletion.

## Stack

TypeScript · SvelteKit 3 + Svelte 5 · Cloudflare Workers · Neon Postgres (Frankfurt) with hand-written SQL · Better Auth · Resend · Zod · Vitest + PGlite.

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
- Without `RESEND_API_KEY`, the sign-in code is printed in the `npm run dev` console.
- `npm test` needs no keys: it uses in-memory Postgres (PGlite).
- `npm run check` runs lint, types, format, tests and build, like CI.

## Status

Under construction: block 0 of 7 of MVP v0. See [CHANGELOG.md](CHANGELOG.md).

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
