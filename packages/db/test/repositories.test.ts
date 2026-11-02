import type { Input, Item, JobScheduler } from "@katip/core";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
	type AnyDatabase,
	createRepositories,
	DrizzleUnitOfWork,
} from "../src/repositories";
import {
	channelIdentities,
	inputs,
	items,
	reminders,
} from "../src/schema/core";
import { createTestDb, insertUser } from "./pglite";

const T0 = new Date("2026-11-06T09:00:00.000Z");

function anInput(overrides: Partial<Input> = {}): Input {
	return {
		id: "00000000-0000-4000-8000-000000000001",
		userId: "u1",
		channel: "chat",
		kind: "text",
		rawText: "haftaya perşembe 19:00 yayın",
		transcript: null,
		parseResult: null,
		parseValid: null,
		parseAttempts: [],
		modelVersion: null,
		corrected: false,
		createdAt: T0,
		...overrides,
	};
}

function anItem(overrides: Partial<Item> = {}): Item {
	return {
		id: "00000000-0000-4000-8000-000000000010",
		ownerId: "u1",
		createdBy: "u1",
		type: "event",
		title: "Yayın izle",
		scope: "personal",
		priority: "high",
		status: "open",
		startsAt: new Date("2026-11-13T16:00:00.000Z"),
		dueAt: null,
		allDay: false,
		sourceInputId: "00000000-0000-4000-8000-000000000001",
		createdAt: T0,
		...overrides,
	};
}

let db: AnyDatabase;

// pg-boss is covered against real Postgres in job-scheduler.test.ts.
const stubJobs: JobScheduler = {
	scheduleReminder: async () => "job-stub",
	cancel: async () => {},
};

beforeEach(async () => {
	db = await createTestDb();
	await insertUser(db, "u1", "Europe/Istanbul");
});

describe("Drizzle repositories", () => {
	it("finds a user with their timezone", async () => {
		const repos = createRepositories(db);
		expect(await repos.users.findById("u1")).toEqual({
			id: "u1",
			timezone: "Europe/Istanbul",
		});
		expect(await repos.users.findById("missing")).toBeNull();
	});

	it("inserts an input and updates it with the parse result", async () => {
		const repos = createRepositories(db);
		const input = anInput();
		await repos.inputs.insert(input);
		await repos.inputs.update({
			...input,
			parseResult: { type: "event", title: "Yayın izle" },
			parseValid: true,
			parseAttempts: [
				{
					raw: "garbage",
					valid: false,
					modelVersion: "fake-model-1",
					error: null,
				},
				{ raw: null, valid: false, modelVersion: null, error: "timeout" },
			],
			modelVersion: "fake-model-1",
		});

		const [row] = await db.select().from(inputs).where(eq(inputs.id, input.id));
		expect(row?.parseResult).toEqual({ type: "event", title: "Yayın izle" });
		expect(row?.parseValid).toBe(true);
		expect(row?.modelVersion).toBe("fake-model-1");
		expect(row?.parseAttempts).toEqual([
			{
				raw: "garbage",
				valid: false,
				modelVersion: "fake-model-1",
				error: null,
			},
			{ raw: null, valid: false, modelVersion: null, error: "timeout" },
		]);
	});

	it("stores instants as UTC timestamptz without shifting them", async () => {
		const repos = createRepositories(db);
		await repos.inputs.insert(anInput());
		await repos.items.insert(anItem());

		const [row] = await db.select().from(items);
		expect(row?.startsAt?.toISOString()).toBe("2026-11-13T16:00:00.000Z");
	});

	it("sets a reminder's job id", async () => {
		const repos = createRepositories(db);
		await repos.inputs.insert(anInput());
		await repos.items.insert(anItem());
		await repos.reminders.insert({
			id: "00000000-0000-4000-8000-000000000020",
			itemId: anItem().id,
			fireAt: new Date("2026-11-13T15:30:00.000Z"),
			status: "pending",
			sentAt: null,
			jobId: null,
		});
		await repos.reminders.setJobId(
			"00000000-0000-4000-8000-000000000020",
			"job-9",
		);

		const [row] = await db.select().from(reminders);
		expect(row?.jobId).toBe("job-9");
	});
});

describe("DrizzleUnitOfWork", () => {
	it("rolls back every write when the work throws", async () => {
		const uow = new DrizzleUnitOfWork(db, () => stubJobs);
		await createRepositories(db).inputs.insert(anInput());

		await expect(
			uow.run(async (repos) => {
				await repos.items.insert(anItem());
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(await db.select().from(items)).toEqual([]);
	});

	it("hands the work a job scheduler built for the same transaction", async () => {
		const seen: unknown[] = [];
		const uow = new DrizzleUnitOfWork(db, (tx) => {
			seen.push(tx);
			return stubJobs;
		});

		const jobs = await uow.run(async (ctx) => ctx.jobs);

		expect(jobs).toBe(stubJobs);
		expect(seen).toHaveLength(1);
		expect(seen[0]).not.toBe(db);
	});

	it("commits writes when the work succeeds", async () => {
		const uow = new DrizzleUnitOfWork(db, () => stubJobs);
		await createRepositories(db).inputs.insert(anInput());
		await uow.run((repos) => repos.items.insert(anItem()));

		expect(await db.select().from(items)).toHaveLength(1);
	});
});

describe("schema constraints", () => {
	it("links an external account to at most one user", async () => {
		await insertUser(db, "u2");
		const identity = { channel: "chat", externalId: "42", linkedAt: T0 };
		await db.insert(channelIdentities).values({
			id: "00000000-0000-4000-8000-000000000030",
			userId: "u1",
			...identity,
		});

		await expect(
			db.insert(channelIdentities).values({
				id: "00000000-0000-4000-8000-000000000031",
				userId: "u2",
				...identity,
			}),
		).rejects.toThrow();
	});
});
