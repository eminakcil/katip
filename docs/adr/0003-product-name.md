# 0003. Product name: Kâtip

- Status: Accepted
- Date: 2026-11-03

## Context

The working names were "Dicta" and "Kâtip". The repo is already `katip`. The product speaks only Turkish to its users.

## Decision

The product is **Kâtip** ("scribe, clerk"). User-facing copy uses "Kâtip" with the circumflex. Code, package scopes (`@katip/*`), URLs, env names and the bot username use ASCII `katip`.

## Consequences

- No renames in the repo.
- The Telegram bot username must be checked in BotFather; `@katip_bot` is likely taken, so expect a suffix (e.g. `@katip_asistan_bot`). The bot username is configuration, never hard-coded.
- Domain and other handles are checked before launch, not now.
