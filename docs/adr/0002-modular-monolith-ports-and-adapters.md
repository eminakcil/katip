# 0002. Modular monolith with ports and adapters

- Status: Accepted
- Date: 2026-11-03

## Context

The product has several entry points (Telegram, web, scheduler, later long recordings and live listening) but one set of business rules. Channels will be added over time. Agents will implement features in parallel, so changes to one feature should not ripple across the codebase. Core logic must be testable without Telegram, a real LLM, or wall-clock time.

## Decision

One repo, one deploy, strict module boundaries:

- `packages/core` holds commands (`CaptureInput`, `AddDetail`, `ListItems`, …), domain types and rules, and **ports** (interfaces) for everything external: repositories, clock, LLM parser, speech-to-text, notifier, id generator.
- Adapters implement ports or drive commands: `packages/telegram` (bot), the web adapter (`packages/api` tRPC routers, served by `apps/server`), infrastructure adapters (Drizzle repositories, OpenRouter parser, pg-boss).
- `apps/scheduler` is a separate process in the same codebase that fires reminders and the morning list through core.
- Commands flow from adapters into core. Notifications leave core through the notifier port and are delivered by the channel adapter.
- Core never imports an adapter, never imports Telegram/Hono/tRPC/Drizzle libraries, and never mentions "Telegram". A Biome `noRestrictedImports` rule scoped to `packages/core/**` enforces this and fails CI.
- The Telegram webhook is registered (`setWebhook`) with a `secret_token` from env (`TELEGRAM_WEBHOOK_SECRET`). The server rejects any webhook request whose `X-Telegram-Bot-Api-Secret-Token` header is missing or does not match (constant-time compare), with 401, before parsing the body or touching core. Accepted updates are deduplicated by `update_id`.
- External identity → internal `userId` mapping happens in the adapter. Adapter-private state (e.g. `tg_message_links`) is owned by that adapter; core does not read it.

## Consequences

- Core tests use in-memory fakes for every port and a fake clock; they are fast and deterministic.
- A new channel is a new adapter; core is unchanged.
- Some wiring code is needed (composition roots in `apps/server` and `apps/scheduler`).
- Core cannot hold user-facing strings; each adapter renders Turkish text from core's structured results.
