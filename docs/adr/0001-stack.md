# 0001. Stack: Better-T-Stack (TypeScript, Hono, tRPC, Drizzle/Postgres, Better-Auth)

- Status: Accepted
- Date: 2026-11-03

## Context

v1 must ship in 3–4 weeks with one developer plus agents. We need a typed backend, a web UI, a relational database with migrations, and authentication without writing our own password system. Agents work best in a codebase with one language and strong types.

## Decision

TypeScript end to end, scaffolded with Better-T-Stack 3.49 (see `bts.jsonc`):

- Runtime: Node.js. Package manager: npm workspaces. Monorepo: Turborepo.
- Server: Hono, API via tRPC.
- Web: React + TanStack Router, Tailwind, shared shadcn/ui in `packages/ui`, PWA.
- Database: PostgreSQL with Drizzle ORM and drizzle-kit migrations.
- Auth: Better-Auth with the Drizzle adapter.
- Lint/format: Biome. Git hooks: lefthook. Env: Varlock (`.env.schema` per app).
- Tests: Vitest; mutation testing: Stryker (added in Phase 1).

## Consequences

- One language and one type system across core, adapters, scheduler and web; tRPC gives end-to-end types to the web UI.
- Better-Auth owns its tables (`user`, `session`, `account`, `verification`). The brief's `users` table is Better-Auth's `user` table extended with a `timezone` field, not a second table.
- Postgres is the only stateful dependency; the job queue reuses it (ADR 0008).
- Boilerplate conventions (Varlock env, tsdown build, Docker files) are kept unless an ADR changes them.
