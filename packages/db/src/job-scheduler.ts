// pg-boss implementation of the core JobScheduler port (ADR 0008).
import type { JobScheduler } from "@katip/core";
import type { PgBoss } from "pg-boss";

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
	constructor(private readonly boss: PgBoss) {}

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
		});
		if (id) return id;

		// Same occurrence already queued (e.g. a retried command): reuse its job.
		const [existing] = await this.boss.findJobs(REMINDER_QUEUE, {
			key,
			queued: true,
		});
		if (!existing) {
			throw new Error(`pg-boss refused job ${key} but no queued job exists`);
		}
		return existing.id;
	}

	async cancel(jobId: string): Promise<void> {
		await this.boss.cancel(REMINDER_QUEUE, jobId);
	}
}
