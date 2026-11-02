# 0008. Job queue: pg-boss

- Status: Accepted
- Date: 2026-11-03

## Context

Reminders must survive restarts, never be lost, and not be sent twice. The morning daily list is a recurring job per user. We already run Postgres and do not want another stateful service.

## Decision

- Use pg-boss (Postgres-backed queue) in `apps/scheduler`.
- The `reminders` table is the source of truth (`fire_at`, `status`, `sent_at`). A pg-boss job is scheduled per reminder with a singleton key equal to the reminder id, so a reminder cannot be enqueued twice.
- The worker re-reads the reminder, skips it unless `status = pending`, sends through the notifier port, then marks it `sent` with `sent_at`. The status check and update use a row lock so concurrent workers cannot both send.
- The morning list uses pg-boss cron scheduling, evaluated in each user's timezone.
- Queue access is behind a core port (`JobScheduler`); core does not import pg-boss.

## Consequences

- No Redis or extra infrastructure; queue data is backed up with the database.
- Delivery is at-least-once at the transport level: a crash after Telegram accepts a message but before the status update can repeat one send. This is accepted; it can never silently drop a reminder.
- pg-boss creates its own schema (`pgboss`); it is excluded from Drizzle migrations.
