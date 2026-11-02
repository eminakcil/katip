# Kâtip — Project Brief

> Handover document. Anyone (human or agent) taking over the project learns the product, scope, architecture and rules from here. Open decisions are listed at the end.
>
> **Language rule:** All code, comments, docs, commit messages, ADRs and issues are in **English**. Everything the end user sees (Telegram bot messages, buttons, commands, web UI text, error messages) is in **Turkish**.

## Summary

Kâtip is a personal assistant that understands anything said to it on Telegram, written or spoken, turns it into a structured record, reminds the user at the right time, and tracks whether it was done. The first user is the project owner, Emin Akçil. The goal is a v1 that can be finished in 3–4 weeks and that has real technical depth.

- **Name:** Kâtip (ADR 0003). The repo is named `katip`.
- **One-sentence product definition:** You say it, it understands, it reminds you at the right time, and it tracks whether it got done.

## Problem and motivation

Things that come to mind (a livestream, a bill, a birthday, a meeting decision) get lost because they are never written down. Even when written down, they are useless if not surfaced at the right time. Existing to-do apps require typed input and do not understand free-form Turkish speech well.

| Goal               | Description                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Personal use       | Emin will use it every day. This is the first measure of success                                                       |
| Technical depth    | An engine that turns free-form Turkish speech into structured records, an eval set, and later a fine-tuned small model |
| Process experience | The project is built with an agent-based development pipeline (see `docs/agent-pipeline.md`)                           |

Scope is deliberately narrow. Selling to companies, team management and personal finance analysis are not goals.

## Product concept

The user writes or sends a voice message to Telegram. The system turns it into an item, confirms it by spelling out the date explicitly, and reminds the user when the time comes.

### Channels

| Channel                        | Version | Note                                                                   |
| ------------------------------ | ------- | ---------------------------------------------------------------------- |
| Telegram text message          | v1      |                                                                        |
| Telegram voice message         | v1      | Converted to text via STT                                              |
| Long audio recording (meeting) | v2      | Bot API download limit is 20 MB                                        |
| Live listening                 | v3      | Bot API does not support voice calls. Needs a userbot or web recording |
| Web UI                         | v1      | Sign-in, account linking, item list and history                        |

### Core flow example

1. User sends a voice message: "Haftaya perşembe akşam 7'de yayın var, mutlaka izlemeliyim." ("There's a livestream next Thursday at 7 pm, I must watch it.")
2. Bot replies: "Not aldım. Yayın izle, 13 Kasım Perşembe 19:00. O gün sabah listede ve 18:30'da hatırlatacağım. Detay eklemek için bu mesajı yanıtla." Under the message: **Düzenle**, **Saati değiştir**, **Sil** buttons.
3. The user replies to that message with the stream link. The link is attached to the item.
4. On the morning of 13 November the stream appears in the daily list. At 18:30 a separate reminder arrives.

Relative date expressions are always echoed back as a full date, so mistakes in ambiguous expressions like "haftaya perşembe" (next Thursday) are caught immediately.

### Item types

| Type        | Example                                     | Default reminder                           |
| ----------- | ------------------------------------------- | ------------------------------------------ |
| Event       | Thursday 19:00 livestream                   | Morning list on the day, and 30 min before |
| Task        | Get the car inspected                       | Morning of the due date                    |
| Reminder    | Remind me a week before                     | At the given time                          |
| Recurring   | Electricity bill on the 15th of every month | On every occurrence                        |
| Annual date | Onur's birthday                             | One day before                             |
| Note        | Information with no time                    | None                                       |

Items live under scopes such as personal, work and other. The system suggests a scope, the user corrects it.

## Scope

v1 is a single-user personal assistant and must be done in 3–4 weeks. New ideas are not added to scope; they go to a "later" list.

**v1: Personal assistant**
- Sign in on the web and link a Telegram account
- Create items from text or voice messages
- Confirmation message that spells out the date, with buttons (Düzenle, Saati değiştir, Sil)
- Add details (link, note) by replying to the confirmation message
- Reminders and a morning daily list
- `/bugun`, `/hafta`, `/liste` commands
- Item list and per-item history on the web

**v2: Long recordings and meetings**
- Extract multiple items from a long audio recording
- Confirmation buttons per item
- Timestamped source on the item ("Kayıt, 14:32")
- Hand an item over to another user

**v3: Live listening**
- Join a group voice chat via userbot, or live transcription via the web

**Out of scope**
- Bank integration and spending analysis. Finance is only a recurring reminder with an amount.
- Team and company workspaces
- Mobile app
- A home-grown password system

## Architecture

The system is a modular monolith: one repo, one deploy, but strict module boundaries. Core knows no channel; channels connect to core through adapters.

```
 Telegram adapter ─┐                    ┌─> Notification port ─> Telegram adapter delivers
 Web adapter ──────┼──> commands ─> CORE ┤
 (future channels) ┘                    └─> DB (Postgres)
                       Scheduler (separate process, same codebase)
```

Commands flow down from adapters into core. Notifications leave core as events and are delivered by the Telegram adapter.

**Rules**
- The word "Telegram" never appears in core. Core accepts commands: `CaptureInput(userId, text | audio)`, `AddDetail(itemId, …)`, `ListItems(userId, day)`.
- The adapter maps the external identity (Telegram user id) to the internal `userId`.
- The message ↔ item mapping used for reply-to-add-detail lives in the Telegram adapter's own table.
- A new channel means a new adapter. Core does not change.
- The scheduler runs as a separate process but lives in the same codebase.
- Core importing an adapter is a lint error in CI.

## Identity and account linking

The user signs in on the web and links their Telegram account with a single-use token. Verification uses the immutable numeric Telegram user id, not the username (usernames can change or be absent).

**Web-initiated linking (default)**
1. User signs in on the web and presses "Telegram'ı bağla".
2. System generates a single-use token valid for 10 minutes and shows the `t.me/<bot>?start=<token>` link (or a QR code).
3. User clicks the link and presses Start in Telegram.
4. Bot receives `/start <token>`; if valid, it links the Telegram user id to the account.
5. Bot says "Hesabın bağlandı", and the web page updates.

**Bot-initiated linking (fallback)**
1. User sends `/baglan` to the bot.
2. Bot returns a 6-digit code valid for 10 minutes.
3. User enters the code on the web and the link is established.

**Security rules**
- Tokens are single-use and short-lived. Stored hashed in the database.
- A Telegram account can be linked to at most one user.
- Code attempts are rate limited.
- Linking can be removed from the web; the bot notifies the user.
- An unlinked account messaging the bot only receives the linking link.

**Web sign-in:** No home-grown password system. Google sign-in via Better-Auth (ADR 0004).

## Data model

The data model is built to already support v2 item hand-over and the fine-tuning dataset. All times are stored in UTC; the time zone is on the user record.

| Table                | Owner            | Key fields                                                                                     | Why                                                                           |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `users`              | Core             | id, email, name, timezone                                                                      |                                                                               |
| `channel_identities` | Core             | user_id, channel, external_id, linked_at                                                       | Maps channel identity to internal identity                                    |
| `link_tokens`        | Core             | token_hash, user_id, direction, expires_at, used_at                                            | Account linking                                                               |
| `inputs`             | Core             | user_id, channel, type, raw content, transcript, parse result, model version, corrected?       | Every message is stored raw. Eval and fine-tune datasets come from here       |
| `items`              | Core             | owner_id, created_by, type, title, scope, starts_at, due_at, priority, status, source_input_id | `owner_id` and `created_by` are separate, so hand-over needs no schema change |
| `item_events`        | Core             | item_id, event, time                                                                           | Item history                                                                  |
| `reminders`          | Core             | item_id, fire_at, status, sent_at                                                              | Scheduler queue                                                               |
| `tg_message_links`   | Telegram adapter | chat_id, message_id, item_id                                                                   | Reply-to-add-detail. Core does not know this table                            |

## Quality, testing and eval

The project's technical depth is in the Turkish understanding engine, and its quality is measured in numbers. The bot is the demo; the engine is the depth.

**Quality principles**
- LLM output is always validated against a schema. Invalid output is retried; if it still fails, the user is asked. Broken data never enters the database.
- Telegram webhooks are idempotent. Duplicates are skipped by `update_id`.
- Reminders are sent from a job queue. A server restart neither loses a reminder nor sends it twice.
- Core is tested without infrastructure: no Telegram, no real LLM, a fake clock.
- Decisions are written as ADRs under `docs/adr/`. `CLAUDE.md` describes the rules.

**Testing approach**
- Tests are written from acceptance criteria, before the code.
- Whoever writes the implementation cannot modify test files. CI enforces this.
- Mutation testing measures whether tests actually catch bugs. CI enforces a threshold.

**Eval and model**
1. In v1 the engine is built with STT (Whisper) and a large LLM.
2. Every message and the user's correction accumulate in the `inputs` table. This is the golden eval set.
3. Hard cases are labeled separately: relative dates ("haftaya perşembe", "ay sonu", "bayramdan sonra"), priority signals ("mutlaka"), STT errors.
4. Field-level accuracy (type, date, title, scope), latency and cost are measured.
5. Once the project settles, a small open-source model (1–4B) is fine-tuned on this data and compared to the large model.

## Development process

The project moves in four phases. The agent pipeline only kicks in once the skeleton is ready.

| Phase          | Who                     | How                     | Output                                                  |
| -------------- | ----------------------- | ----------------------- | ------------------------------------------------------- |
| 0. Decisions   | Emin and AI             | Conversation            | PRD, ADRs, `CLAUDE.md`                                  |
| 1. Skeleton    | Emin and a single agent | One interactive session | Green CI, one end-to-end sample feature, pipeline files |
| 2. Calibration | Pipeline, WIP 1         | Close supervision       | Improved agent instructions and CI rules                |
| 3. Normal flow | Pipeline, WIP 2–3       | Via the board           | Features                                                |

**Pipeline:** Tasks live in GitHub Issues and a GitHub Projects board. Every PR is linked to a task with `Closes #N`. A tester agent writes tests from acceptance criteria, an implementer agent writes code and opens a PR, a reviewer agent approves or requests changes. Agents run under separate GitHub App identities. Risky paths require Emin's approval via `CODEOWNERS`. Full spec: `docs/agent-pipeline.md`.

**Checklist for switching to the pipeline**
- [ ] CI is green on main (test, typecheck, lint, mutation)
- [ ] At least one end-to-end sample feature exists
- [ ] `CLAUDE.md` and ADRs describe the conventions
- [ ] A new task can be described with acceptance criteria without requiring an architecture decision
- [ ] The structure is modular; different features touch different files

**Definition of done for v1**
- [ ] Emin used the bot every day for a week
- [ ] Live demo and README exist
- [ ] Eval table is published
- [ ] A write-up about the project is published

## Risks and open decisions

The biggest risk is scope creep and the project being left half-done. The second is a missed reminder destroying the user's trust.

| Risk                              | Mitigation                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Scope creep                       | v1 list is fixed. New ideas go to the "later" list                                                                 |
| Missed reminder                   | Durable job queue, duplicate-send guard, monitoring                                                                |
| Misinterpreted relative dates     | Full date in the confirmation message, hard cases in the eval set                                                  |
| STT errors                        | Transcript is stored, corrections go into the eval set                                                             |
| Crowded market                    | The edge is Turkish understanding quality and follow-up. Target is personal use and technical depth, not companies |
| Userbot account restrictions (v3) | Live listening stays experimental; web recording stays as an alternative                                           |

**Open decisions**
- [x] Name: Kâtip (ADR 0003). Bot username still to be checked in BotFather.
- [x] Stack: TypeScript (Node + Postgres). Settled by the Better-T-Stack boilerplate: Hono, tRPC, Drizzle, Better-Auth, TanStack Router, Turborepo, Biome (ADR 0001).
- [x] Web sign-in: Google only (ADR 0004)
- [x] STT and LLM: hosted STT behind a port, provider chosen with the voice feature (ADR 0005); LLM via OpenRouter, Claude Haiku 5.5 by default (ADR 0006)
- [x] Hosting: single VPS with docker compose (ADR 0007); job queue pg-boss (ADR 0008)
