// Runs against real Postgres (pg-boss needs multiple connections and advisory
// locks, so PGlite is not used here). Locally: `npm run db:start`. CI: a
// postgres service container. Each run uses its own throwaway schema.

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	ensureQueues,
	PgBossJobScheduler,
	REMINDER_QUEUE,
	type ReminderJobData,
	reminderJobKey,
} from "../src/job-scheduler";
import { relations } from "../src/relations";
import type { AnyDatabase } from "../src/repositories";

const connectionString =
	process.env.TEST_DATABASE_URL ??
	"postgres://postgres:password@localhost:5432/katip";
const schema = `pgboss_test_${process.pid}_${Date.now()}`;

let boss: PgBoss;
let scheduler: PgBossJobScheduler;
let pool: pg.Pool;
let db: AnyDatabase;

beforeAll(async () => {
	boss = new PgBoss({ connectionString, schema });
	boss.on("error", () => {});
	await boss.start();
	await ensureQueues(boss);
	scheduler = new PgBossJobScheduler(boss);
	pool = new pg.Pool({ connectionString });
	db = drizzle({ client: pool, relations }) as unknown as AnyDatabase;
});

afterAll(async () => {
	await boss?.stop({ graceful: false });
	await pool?.end();
	const client = new pg.Client({ connectionString });
	await client.connect();
	await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
	await client.end();
});

describe("PgBossJobScheduler", () => {
	it("schedules a deferred job keyed by reminder occurrence", async () => {
		const fireAt = new Date("2099-11-13T15:30:00.000Z");
		const jobId = await scheduler.scheduleReminder({
			reminderId: "rem-1",
			fireAt,
		});

		const [job] = await boss.findJobs<ReminderJobData>(REMINDER_QUEUE, {
			id: jobId,
		});
		expect(job?.data).toEqual({
			reminderId: "rem-1",
			fireAt: "2099-11-13T15:30:00.000Z",
		});
		expect(job?.singletonKey).toBe(reminderJobKey("rem-1", fireAt));
		expect(job?.startAfter.toISOString()).toBe("2099-11-13T15:30:00.000Z");
	});

	it("returns the existing job when the same occurrence is scheduled twice", async () => {
		const fireAt = new Date("2099-11-14T08:00:00.000Z");
		const first = await scheduler.scheduleReminder({
			reminderId: "rem-2",
			fireAt,
		});
		const second = await scheduler.scheduleReminder({
			reminderId: "rem-2",
			fireAt,
		});

		expect(second).toBe(first);
		const jobs = await boss.findJobs(REMINDER_QUEUE, {
			key: reminderJobKey("rem-2", fireAt),
		});
		expect(jobs).toHaveLength(1);
	});

	it("does not block a rescheduled occurrence of the same reminder", async () => {
		const oldJob = await scheduler.scheduleReminder({
			reminderId: "rem-3",
			fireAt: new Date("2099-11-15T08:00:00.000Z"),
		});
		const newJob = await scheduler.scheduleReminder({
			reminderId: "rem-3",
			fireAt: new Date("2099-11-15T09:00:00.000Z"),
		});

		expect(newJob).not.toBe(oldJob);
	});

	it("cancels a job by id", async () => {
		const jobId = await scheduler.scheduleReminder({
			reminderId: "rem-4",
			fireAt: new Date("2099-11-16T08:00:00.000Z"),
		});
		await scheduler.cancel(jobId);

		const [job] = await boss.findJobs(REMINDER_QUEUE, { id: jobId });
		expect(job?.state).toBe("cancelled");
	});
});

describe("PgBossJobScheduler inside a Drizzle transaction (ADR 0008)", () => {
	it("leaves no job behind when the transaction rolls back", async () => {
		let jobId = "";
		await expect(
			db.transaction(async (tx) => {
				jobId = await PgBossJobScheduler.inTransaction(
					boss,
					tx,
				).scheduleReminder({
					reminderId: "rem-tx-1",
					fireAt: new Date("2099-12-01T08:00:00.000Z"),
				});
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");

		expect(jobId).not.toBe("");
		expect(await boss.findJobs(REMINDER_QUEUE, { id: jobId })).toEqual([]);
	});

	it("keeps the job when the transaction commits", async () => {
		const jobId = await db.transaction((tx) =>
			PgBossJobScheduler.inTransaction(boss, tx).scheduleReminder({
				reminderId: "rem-tx-2",
				fireAt: new Date("2099-12-02T08:00:00.000Z"),
			}),
		);

		const [job] = await boss.findJobs<ReminderJobData>(REMINDER_QUEUE, {
			id: jobId,
		});
		expect(job?.data.reminderId).toBe("rem-tx-2");
	});

	it("is not visible outside the transaction before commit", async () => {
		await db.transaction(async (tx) => {
			const jobId = await PgBossJobScheduler.inTransaction(
				boss,
				tx,
			).scheduleReminder({
				reminderId: "rem-tx-3",
				fireAt: new Date("2099-12-03T08:00:00.000Z"),
			});
			// `boss` uses its own pool, so it cannot see the uncommitted row.
			expect(await boss.findJobs(REMINDER_QUEUE, { id: jobId })).toEqual([]);
		});
	});
});
