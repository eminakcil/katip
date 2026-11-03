// ItemRepository.listOpenInRange against Postgres (PGlite), issue #2.
//
// AC7 The Drizzle repository implements the query with the same semantics as
//     the in-memory fake (AC1–AC4):
//     AC1 open items whose time is inside the range; event/reminder time is
//         startsAt, task time is dueAt.
//     AC2 the range is half-open: `from` included, `to` excluded.
//     AC3 other owners' items and notes are never returned.
//     AC4 done and cancelled items are not returned.
// Order is unspecified by the port, so results are compared sorted by id.

import type { InstantRange, Item } from "@katip/core";
import { beforeEach, describe, expect, it } from "vitest";

import { type AnyDatabase, createRepositories } from "../src/repositories";
import { createTestDb, insertUser } from "./pglite";

// Local day 2026-11-12 in Europe/Istanbul (UTC+3).
const RANGE: InstantRange = {
	from: new Date("2026-11-11T21:00:00.000Z"),
	to: new Date("2026-11-12T21:00:00.000Z"),
};

let db: AnyDatabase;
let counter = 0;

function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}

function anItem(overrides: Partial<Item> = {}): Item {
	counter += 1;
	return {
		id: uuid(counter),
		ownerId: "u1",
		createdBy: "u1",
		type: "event",
		title: `Item ${counter}`,
		scope: "personal",
		priority: "normal",
		status: "open",
		startsAt: null,
		dueAt: null,
		allDay: false,
		sourceInputId: null,
		createdAt: new Date("2026-11-01T09:00:00.000Z"),
		...overrides,
	};
}

async function seed(...items: Item[]): Promise<void> {
	const repos = createRepositories(db);
	for (const item of items) await repos.items.insert(item);
}

async function listIds(ownerId = "u1", range = RANGE): Promise<string[]> {
	const found = await createRepositories(db).items.listOpenInRange(
		ownerId,
		range,
	);
	return found.map((item) => item.id).sort();
}

beforeEach(async () => {
	counter = 0;
	db = await createTestDb();
	await insertUser(db, "u1", "Europe/Istanbul");
	await insertUser(db, "u2", "Europe/Istanbul");
});

describe("Drizzle ItemRepository.listOpenInRange", () => {
	it("AC7/AC1: returns open events, reminders and tasks inside the range", async () => {
		await seed(
			anItem({
				id: uuid(101),
				type: "event",
				startsAt: new Date("2026-11-12T16:00:00.000Z"),
			}),
			anItem({
				id: uuid(102),
				type: "reminder",
				startsAt: new Date("2026-11-12T07:15:00.000Z"),
			}),
			anItem({
				id: uuid(103),
				type: "task",
				dueAt: new Date("2026-11-12T11:00:00.000Z"),
			}),
			anItem({
				id: uuid(104),
				type: "event",
				startsAt: new Date("2026-11-13T16:00:00.000Z"),
			}),
		);

		expect(await listIds()).toEqual([uuid(101), uuid(102), uuid(103)]);
	});

	it("AC7/AC1: returns items with every field intact", async () => {
		const stored = anItem({
			id: uuid(201),
			type: "task",
			title: "Kira öde",
			scope: "work",
			priority: "high",
			dueAt: new Date("2026-11-11T21:00:00.000Z"),
			allDay: true,
		});
		await seed(stored);

		expect(
			await createRepositories(db).items.listOpenInRange("u1", RANGE),
		).toEqual([stored]);
	});

	it("AC7/AC1: a task's time is dueAt, an event's and reminder's time is startsAt", async () => {
		await seed(
			anItem({
				id: uuid(301),
				type: "task",
				dueAt: new Date("2026-11-12T11:00:00.000Z"),
				startsAt: new Date("2026-11-20T11:00:00.000Z"),
			}),
			anItem({
				id: uuid(302),
				type: "task",
				dueAt: new Date("2026-11-20T11:00:00.000Z"),
				startsAt: new Date("2026-11-12T11:00:00.000Z"),
			}),
			anItem({
				id: uuid(303),
				type: "event",
				startsAt: new Date("2026-11-12T12:00:00.000Z"),
				dueAt: new Date("2026-11-20T12:00:00.000Z"),
			}),
			anItem({
				id: uuid(304),
				type: "reminder",
				dueAt: new Date("2026-11-12T13:00:00.000Z"),
			}),
		);

		expect(await listIds()).toEqual([uuid(301), uuid(303)]);
	});

	it("AC7/AC2: `from` is included, `to` is excluded, for startsAt and dueAt", async () => {
		await seed(
			anItem({ id: uuid(401), type: "event", startsAt: RANGE.from }),
			anItem({ id: uuid(402), type: "event", startsAt: RANGE.to }),
			anItem({
				id: uuid(403),
				type: "event",
				startsAt: new Date("2026-11-11T20:59:00.000Z"),
			}),
			anItem({
				id: uuid(404),
				type: "event",
				startsAt: new Date("2026-11-12T20:59:59.999Z"),
			}),
			anItem({ id: uuid(405), type: "task", dueAt: RANGE.from }),
			anItem({ id: uuid(406), type: "task", dueAt: RANGE.to }),
			anItem({
				id: uuid(407),
				type: "task",
				dueAt: new Date("2026-11-11T20:59:59.999Z"),
			}),
		);

		expect(await listIds()).toEqual([uuid(401), uuid(404), uuid(405)]);
	});

	it("AC7/AC3: never returns other owners' items", async () => {
		await seed(
			anItem({
				id: uuid(501),
				startsAt: new Date("2026-11-12T16:00:00.000Z"),
			}),
			anItem({
				id: uuid(502),
				ownerId: "u2",
				createdBy: "u2",
				startsAt: new Date("2026-11-12T16:00:00.000Z"),
			}),
			anItem({
				id: uuid(503),
				ownerId: "u2",
				createdBy: "u1",
				type: "task",
				dueAt: new Date("2026-11-12T11:00:00.000Z"),
			}),
		);

		expect(await listIds("u1")).toEqual([uuid(501)]);
		expect(await listIds("u2")).toEqual([uuid(502), uuid(503)]);
		expect(await listIds("nobody")).toEqual([]);
	});

	it("AC7/AC3: never returns notes", async () => {
		await seed(
			anItem({ id: uuid(601), type: "note", title: "Kitap önerisi" }),
			anItem({
				id: uuid(602),
				startsAt: new Date("2026-11-12T16:00:00.000Z"),
			}),
		);

		expect(await listIds()).toEqual([uuid(602)]);
	});

	it("AC7/AC4: does not return done or cancelled items", async () => {
		await seed(
			anItem({
				id: uuid(701),
				type: "task",
				status: "done",
				dueAt: new Date("2026-11-12T08:00:00.000Z"),
			}),
			anItem({
				id: uuid(702),
				status: "cancelled",
				startsAt: new Date("2026-11-12T09:00:00.000Z"),
			}),
			anItem({
				id: uuid(703),
				type: "reminder",
				status: "done",
				startsAt: new Date("2026-11-12T10:00:00.000Z"),
			}),
			anItem({
				id: uuid(704),
				startsAt: new Date("2026-11-12T11:00:00.000Z"),
			}),
		);

		expect(await listIds()).toEqual([uuid(704)]);
	});
});
