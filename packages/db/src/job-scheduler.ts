// pg-boss implementation of the core JobScheduler port (ADR 0008).
import type { JobScheduler } from "@katip/core";
import { type SQLWrapper, sql } from "drizzle-orm";
import { type Db, fromDrizzle, type PgBoss } from "pg-boss";

import type { AnyTransaction } from "./repositories";

export const REMINDER_QUEUE = "reminder-delivery";

export interface ReminderJobData {
	reminderId: string;
	/** ISO-8601 UTC. The worker skips the job if the row's fire_at differs. */
	fireAt: string;
}

/** One job per reminder occurrence: a new fire time never collides with the old job. */
export function reminderJobKey(reminderId: string, fireAt: Date): string {
	return `${reminderId}:${fireAt.toISOString()}`;
}

/** Idempotent: safe to call on every process start. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
	const existing = await boss.getQueue(REMINDER_QUEUE);
	if (!existing) {
		// `exclusive`: at most one queued-or-active job per singleton key.
		await boss.createQueue(REMINDER_QUEUE, { policy: "exclusive" });
	}
}

export class PgBossJobScheduler implements JobScheduler {
	/**
	 * @param db When given, every queue write runs on this connection, i.e.
	 * inside the caller's transaction (ADR 0008).
	 */
	constructor(
		private readonly boss: PgBoss,
		private readonly db?: Db,
	) {}

	/** A scheduler whose writes join the given Drizzle transaction. */
	static inTransaction(boss: PgBoss, tx: AnyTransaction): PgBossJobScheduler {
		// Drizzle 1.0 needs an explicit row mode; pg-boss expects row objects.
		const executor = {
			execute: (query: unknown) => tx.execute(query as SQLWrapper, "objects"),
		};
		return new PgBossJobScheduler(boss, fromDrizzle(executor, sql));
	}

	async scheduleReminder(job: {
		reminderId: string;
		fireAt: Date;
	}): Promise<string> {
		const key = reminderJobKey(job.reminderId, job.fireAt);
		const data: ReminderJobData = {
			reminderId: job.reminderId,
			fireAt: job.fireAt.toISOString(),
		};
		const id = await this.boss.send(REMINDER_QUEUE, data, {
			singletonKey: key,
			startAfter: job.fireAt,
			retryLimit: 5,
			retryBackoff: true,
			db: this.db,
		});
		if (id) return id;

		// Same occurrence already queued (e.g. a retried command): reuse its job.
		const [existing] = await this.boss.findJobs(REMINDER_QUEUE, {
			key,
			queued: true,
			db: this.db,
		});
		if (!existing) {
			throw new Error(`pg-boss refused job ${key} but no queued job exists`);
		}
		return existing.id;
	}

	async cancel(jobId: string): Promise<void> {
		await this.boss.cancel(REMINDER_QUEUE, jobId, { db: this.db });
	}
}
