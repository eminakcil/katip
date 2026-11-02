# Backlog

Candidate tasks, roughly in priority order. Each becomes a GitHub issue with acceptance criteria when it is picked up. Ideas outside v1 go to **Later**, not into v1 (CLAUDE.md).

## v1

### Test and pipeline hardening

- **Tester follow-up: tighten parser schema tests.** Stryker shows surviving mutants: the `^`/`$` anchors of the date and time regexes (e.g. `"19:00x"`, `"2026-11-13x"` are not tested), a thrown non-`Error` value, and the 500-character cap on stored parser error messages.
- **test-guard: close tester-identity spoofing.** Commit author names are self-declared, so an implementer commit authored as `eminakcil-tester[bot]` still passes. Proposed fix: `tester.yml` sets a `tests-frozen` commit status on the SHA it hands off (the implementer app has read-only commit statuses), and test-guard fails if test paths differ between that SHA and the PR head.

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
