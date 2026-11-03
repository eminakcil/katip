# Architecture Decision Records

One file per decision, numbered, never renumbered. A decision is changed by a new ADR that supersedes the old one; the old one gets `Status: Superseded by NNNN`.

| #                                                   | Title                                                                         | Status   |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| [0001](0001-stack.md)                               | Stack: Better-T-Stack (TypeScript, Hono, tRPC, Drizzle/Postgres, Better-Auth) | Accepted |
| [0002](0002-modular-monolith-ports-and-adapters.md) | Modular monolith with ports and adapters                                      | Accepted |
| [0003](0003-product-name.md)                        | Product name: Kâtip                                                           | Accepted |
| [0004](0004-web-sign-in-google.md)                  | Web sign-in with Google only                                                  | Accepted |
| [0005](0005-speech-to-text.md)                      | Speech-to-text: hosted API behind a port, provider deferred                   | Accepted |
| [0006](0006-llm-parsing-via-openrouter.md)          | LLM parsing via OpenRouter, Claude Haiku 5.5 by default                       | Accepted |
| [0007](0007-hosting-vps-docker-compose.md)          | Hosting: single VPS with docker compose                                       | Accepted |
| [0008](0008-job-queue-pg-boss.md)                   | Job queue: pg-boss                                                            | Accepted |
| [0009](0009-agent-pipeline-configuration.md)        | Agent pipeline configuration                                                  | Accepted |
| [0010](0010-local-agent-pipeline.md)                | Local agent pipeline (trial)                                                  | Proposed |

## Template

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context

What forces are at play and why a decision is needed.

## Decision

What we decided, stated plainly.

## Consequences

What becomes easier, what becomes harder, what we must now do.
```
