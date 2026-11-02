# 0008. Job queue: pg-boss

- Status: Accepted
- Date: 2026-11-03

## Context

Reminders must survive restarts, never be lost, and not be sent twice. The morning daily list is a recurring job per user. We already run Postgres and do not want another stateful service.

## Decision

- Use pg-boss (Postgres-backed queue) in `apps/scheduler`.
- The `reminders` table is the source of truth (`fire_at`, `status`, `sent_at`). A pg-boss job is scheduled per reminder **occurrence**: the payload carries `reminderId` and `fireAt`, and the singleton key is `<reminderId>:<fireAt as ISO-8601 UTC>`. The same occurrence cannot be enqueued twice, and a new time is never blocked by the old job.
- The worker re-reads the reminder under a row lock and **skips the job unless `status = pending` and the row's `fire_at` equals the job's `fireAt`**. Otherwise it sends through the notifier port, then marks the row `sent` with `sent_at` in the same transaction that holds the lock, so concurrent workers cannot both send.
- **Rescheduling** ("Saati değiştir") updates the row's `fire_at`, enqueues a job for the new occurrence, and cancels the old job by its id (stored on the reminder row). Cancelling is cleanup only: if it fails or races with the worker, the stale job still finds a `fire_at` mismatch and skips. Deleting an item sets its reminders to `cancelled`, which the same check skips.
- The morning list uses pg-boss cron scheduling, evaluated in each user's timezone.
- Queue access is behind a core port (`JobScheduler`); core does not import pg-boss.

## Consequences

- No Redis or extra infrastructure; queue data is backed up with the database.
- Delivery is at-least-once at the transport level: a crash after Telegram accepts a message but before the status update can repeat one send. This is accepted; it can never silently drop a reminder.
- Correctness depends on the row check, not on job cancellation; the core reminder rules ("skip unless pending and fire_at matches") are unit-tested with a fake clock.
- `reminders` gets a `job_id` column for cancellation.
- pg-boss creates its own schema (`pgboss`); it is excluded from Drizzle migrations.
