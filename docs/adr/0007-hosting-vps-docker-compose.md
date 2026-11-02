# 0007. Hosting: single VPS with docker compose

- Status: Accepted
- Date: 2026-11-03

## Context

The system has a long-running scheduler process, a Postgres database, an HTTP server that must receive Telegram webhooks over HTTPS, and a static web app. The boilerplate already ships Dockerfiles and a `docker-compose.yml`. Budget is personal.

## Decision

Deploy to one small VPS (e.g. Hetzner, roughly €4–6/month) running docker compose with services: `server`, `web`, `scheduler`, `postgres`, plus Caddy as reverse proxy with automatic TLS.

## Consequences

- Cheapest option; a long-lived scheduler and Postgres cost nothing extra.
- We own operations: OS updates, a nightly `pg_dump` to off-site object storage, and basic uptime monitoring (a missed reminder is the top trust risk).
- The compose file gains a `scheduler` service and a Caddy service; deploy is `docker compose pull && up -d` (automation is a later task).
- Code stays platform-agnostic (Docker images, env via Varlock), so moving to a managed platform later is possible.
