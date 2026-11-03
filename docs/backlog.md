# Backlog

Candidate tasks, roughly in priority order. Each becomes a GitHub issue with acceptance criteria when it is picked up. Ideas outside v1 go to **Later**, not into v1 (CLAUDE.md).

## v1

### Test and pipeline hardening

- **Tester follow-up: tighten parser schema tests.** Stryker shows surviving mutants: the `^`/`$` anchors of the date and time regexes (e.g. `"19:00x"`, `"2026-11-13x"` are not tested), a thrown non-`Error` value, and the 500-character cap on stored parser error messages.

- **`apps/web` check-types fails locally on Varlock env config.** Reported by the implementer on PR #4; CI passes. Likely the local `.env` / `NODE_ENV` combination that `vite build` (part of `check-types`) validates through the Varlock Vite integration. Reproduce, then fix the schema or the script. Also seen by the implementer on the Actions runner (PR #10).

- **Clear pipeline labels when an issue closes.** Closed issues keep `agent:ready` and `agent:tests-ready` (e.g. #9). Add a small workflow on `issues: closed` that removes the `agent:*` labels (keep `needs-human` so it stays visible), using `GITHUB_TOKEN` with `issues: write`. Must not trigger any agent workflow.

- **Refactor: one `localDay` helper for the list commands.** `list-today.ts`, `list-week.ts` and `list-all.ts` in `packages/core/src/commands/` each have their own copy of the local-calendar-day helper (and `addDays` in two of them). Extract it into `packages/core/src/domain/`, next to `item-order.ts`, so day grouping cannot drift between `/bugun`, `/hafta` and `/liste`. Behaviour unchanged; existing tests must stay green. From the #22 review.

### Features

- Reminder delivery worker in `apps/scheduler`: skip unless the row is `pending` and its `fire_at` matches the job (ADR 0008), deliver through the `Notifier` port, mark `sent`.
- Morning daily list per user, in the user's timezone.
- Account linking: web-initiated `/start <token>` and bot-initiated `/baglan` code; unlink from the web with a bot notice.
- Confirmation buttons: **Düzenle**, **Saati değiştir** (reschedule in one transaction, ADR 0008), **Sil**.
- Reply to the confirmation message to add a detail (link, note) via `tg_message_links`.
- `/bugun`, `/hafta`, `/liste`.
- Voice messages: pick the STT provider (follow-up ADR to 0005), transcribe, store the transcript.
- Recurring and annual items (currently `unsupported_type`).
- Web: item list and per-item history.

### Operations

- `scheduler` Docker image and compose service, Caddy with TLS, nightly `pg_dump` off-site, uptime monitoring (ADR 0007).

## Later (not v1)

- Long recordings and meetings (v2), live listening (v3) — see the brief.
- **`/liste` paging.** Page past the first 20 items with `← Geri` / `İleri →` inline buttons, replacing the `… ve {n} kayıt daha.` line (owner idea from #22). Note: `ItemRepository.listOpen` currently fetches every open item with no limit or ordering in the database, and core sorts and caps; fine at personal volume, but paging should move ordering and limit/offset (or a cursor) into the query.
