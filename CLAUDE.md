# CLAUDE.md

Rules for anyone (human or agent) changing this repo. Product and scope: `docs/project-brief.md`. Decisions: `docs/adr/`. Agent pipeline: `docs/agent-pipeline.md`. If something here conflicts with an ADR, the ADR wins; fix this file.

## Language rule

- **English:** code, identifiers, comments, docs, ADRs, commit messages, issues, PR text.
- **Turkish:** everything the end user sees: bot replies, inline buttons (`Düzenle`, `Saati değiştir`, `Sil`), bot commands (`/bugun`, `/hafta`, `/liste`, `/baglan`), web UI copy, validation and error messages.
- Dates shown to users are formatted for `tr-TR` in the user's timezone, e.g. `12 Kasım Perşembe 19:00`. Relative expressions are always echoed back as a full date.
- Never inline a Turkish string in logic. User-facing strings live in exactly one module per app:
  - Telegram: `packages/telegram/src/strings.ts` (texts, button labels, command menu; `tr-TR` date/time formatting is in `format.ts` next to it)
  - Web: `apps/web/src/strings.ts`
  - Core has **no** user-facing strings. It returns structured results and error codes; adapters render them.

## Module boundaries (ADR 0002)

```
packages/core       commands, domain types/rules, ports (interfaces). Pure TypeScript.
packages/db         Drizzle schema, migrations, repositories, pg-boss JobScheduler, Telegram tables
packages/telegram   Telegram adapter: update handling, rendering, webhook route, grammY glue
packages/llm        OpenRouter InputParser adapter (ADR 0006)
packages/api        Web adapter: tRPC routers calling core commands
packages/auth       Better-Auth configuration (Google only, ADR 0004)
packages/ui         Shared shadcn/ui components
apps/server         Composition root: Hono HTTP server (tRPC, auth, Telegram webhook)
apps/scheduler      Composition root: pg-boss workers for reminders and the morning list
apps/web            React + TanStack Router UI
```

- `packages/core` must not import any other workspace package or any infrastructure library (Telegram, Hono, tRPC, Drizzle, pg, pg-boss, Better-Auth, HTTP clients). Allowed: `zod` and small pure utilities. A Biome `noRestrictedImports` rule enforces this; CI fails on violation.
- The word "Telegram" (and chat ids, message ids, update ids) never appears in core. Adapters map external identities to an internal `userId` before calling core.
- Core talks to the outside only through ports: repositories, `Clock`, `IdGenerator`, `InputParser` (LLM), `SpeechToText`, `Notifier`, `JobScheduler`.
- Every LLM result is validated against a Zod schema in core before use. Invalid output is retried once, then the user is asked. Invalid data never reaches the database.
- All times are stored in UTC (`timestamptz`). The user's IANA timezone is on the user record; convert only at the edges (parsing input, rendering output).
- The Telegram webhook is registered with a `secret_token` (`TELEGRAM_WEBHOOK_SECRET`). The server rejects, with 401, any webhook request whose `X-Telegram-Bot-Api-Secret-Token` header is missing or does not match (constant-time compare), before parsing the body or calling core.
- Telegram webhooks are idempotent by `update_id`. If handling fails, the claim is released and the webhook answers 500 so Telegram retries.
- Reminder jobs are enqueued inside the same transaction as the rows they refer to (`UnitOfWork` hands commands a `jobs` scheduler, ADR 0008).
- Adapters stay thin. Logic that can be tested belongs in core (mutation testing only covers core, ADR 0009).

## Testing rules

- Tests are written **from acceptance criteria, before the code**. Each test name says which criterion it covers, e.g. `it("AC2: echoes the full date in Turkish", …)`.
- **Whoever implements a change does not edit tests.** Test paths are `**/*.test.ts` and `**/test/**` (fixtures and fakes live in `test/` folders). If a test looks wrong, stop and raise it; do not change it. CI `test-guard` enforces this on implementer PRs: test paths must match the tester's `tests-frozen` commit, and CI, lint and mutation config may not change. Implementers merge `main` into task branches and never rebase.
- **The tester owns port fakes and port interfaces.** Because fakes live under `test/`, the implementer cannot add one. So when acceptance criteria imply a new port (or a new method on one), the tester defines the interface in `packages/core/src/ports/` (types only, no implementation) and its in-memory fake under `packages/core/test/fakes/`, in the same change as the tests. The same holds for adapter ports (e.g. `packages/telegram/src/ports.ts` with fakes in `packages/telegram/test/`). If the implementer finds a port missing or wrong, it stops and raises it instead of working around it.
- Core tests use in-memory fakes for every port and a **fake clock**. No real time (`Date.now()`, `new Date()` without arguments) in core; read time from the `Clock` port.
- No real LLM, STT, Telegram or network calls in core tests. The fake parser returns canned outputs, including invalid ones, to exercise schema validation.
- Adapter tests may use Postgres (via docker compose) but never call external services.
- A test that passes before the implementation exists proves nothing. New tests must fail first.
- Mutation testing (Stryker) runs on `packages/core`; the break threshold is 70%.

## Commands

Run from the repo root.

| Command                                      | What it does                               |
| -------------------------------------------- | ------------------------------------------ |
| `npm install`                                | Install all workspaces                     |
| `npm run dev`                                | Run server and web in dev mode             |
| `npm run db:start`                           | Start Postgres via docker compose          |
| `npm run db:generate` / `npm run db:migrate` | Generate / apply Drizzle migrations        |
| `npm test`                                   | Vitest across all workspaces via turbo     |
| `npm run test:mutation`                      | Stryker on `packages/core`                 |
| `npm run check-types`                        | `tsc --noEmit` across workspaces           |
| `npm run lint`                               | Biome check without writing (what CI runs) |
| `npm run check`                              | Biome check with auto-fix                  |

Postgres must be running (`npm run db:start`) for `npm test`: the pg-boss adapter tests use it. Other DB tests use in-process PGlite.

Before committing: `npm run lint && npm run check-types && npm test`.

## Local bot testing

- **Dev: long polling.** With `TELEGRAM_MODE=polling` (the default) the server pulls updates from Telegram, so no tunnel or public URL is needed. Use a separate dev bot token from BotFather. Starting polling deletes any webhook registered for that token.
- **Production: webhook.** Set `TELEGRAM_MODE=webhook` and `TELEGRAM_WEBHOOK_SECRET`, then run `npm run telegram:set-webhook` in `apps/server` once per deploy. The server refuses to start in production with polling.
- Without `TELEGRAM_BOT_TOKEN` the server runs with the bot disabled. With it, `OPENROUTER_API_KEY` is required.
- **Linking in dev:** sign in on the web with Google, then run `npm run dev:link-telegram -- <email> <telegram-user-id>` in `apps/server`. The script is CLI-only and refuses to run with `NODE_ENV=production`; the real `/start <token>` flow is a backlog task.

## Conventions

- Commits: Conventional Commits in English (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`, `ci:`). One logical change per commit.
- Pipeline PRs reference their task with `Closes #N` and are squash-merged.
- New architectural choices get an ADR in `docs/adr/` (use the template in `docs/adr/README.md`).
- Environment variables are declared in each app's `.env.schema` (Varlock); never commit secrets.
- Candidate tasks live in `docs/backlog.md`. Out-of-scope ideas go to its "Later" section, not into v1.

## Protected paths

Changes to these need the owner's review (`.github/CODEOWNERS`): `.github/` (workflows, agent instructions, CI scripts), `packages/auth/`, `packages/db/src/migrations/`.
