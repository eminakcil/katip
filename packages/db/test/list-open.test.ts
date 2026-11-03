// ItemRepository.listOpen against Postgres (PGlite), issue #22.
//
// The Drizzle repository implements the port with the same semantics as the
// in-memory fake. It backs core's ListAll, so it carries the repository side of:
//   AC1 every open item of the owner, with no date bound (past, today, future);
//       dated items (events, reminders, tasks) and notes alike.
//   AC4 done and cancelled items, and other owners' items, are never returned.
// Order is unspecified by the port, so results are compared sorted by id.

import type { Item } from "@katip/core";
import { beforeEach, describe, expect, it } from "vitest";

import { type AnyDatabase, createRepositories } from "../src/repositories";
import { createTestDb, insertUser } from "./pglite";

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

async function listIds(ownerId = "u1"): Promise<string[]> {
	const found = await createRepositories(db).items.listOpen(ownerId);
	return found.map((item) => item.id).sort();
}

beforeEach(async () => {
	counter = 0;
	db = await createTestDb();
	await insertUser(db, "u1", "Europe/Istanbul");
	await insertUser(db, "u2", "Europe/Istanbul");
});

describe("Drizzle ItemRepository.listOpen", () => {
	it("AC1: returns open events, reminders, tasks and notes with no date bound", async () => {
		await seed(
			anItem({
				id: uuid(101),
				type: "event",
				startsAt: new Date("2020-01-05T07:00:00.000Z"),
			}),
			anItem({
				id: uuid(102),
				type: "reminder",
				startsAt: new Date("2026-11-12T07:15:00.000Z"),
			}),
			anItem({
				id: uuid(103),
				type: "task",
				dueAt: new Date("2031-06-01T11:00:00.000Z"),
			}),
			anItem({ id: uuid(104), type: "note", title: "Wi-Fi şifresi" }),
		);

		expect(await listIds()).toEqual([
			uuid(101),
			uuid(102),
			uuid(103),
			uuid(104),
		]);
	});

	it("AC1: returns items with every field intact", async () => {
		const dated = anItem({
			id: uuid(201),
			type: "task",
			title: "Kira öde",
			scope: "work",
			priority: "high",
			dueAt: new Date("2026-11-11T21:00:00.000Z"),
			allDay: true,
		});
		const undated = anItem({
			id: uuid(202),
			type: "note",
			title: "Kitap önerisi",
			createdAt: new Date("2026-10-03T08:30:00.000Z"),
		});
		await seed(dated, undated);

		const found = await createRepositories(db).items.listOpen("u1");

		expect([...found].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
			dated,
			undated,
		]);
	});

	it("AC4: never returns other owners' items", async () => {
		await seed(
			anItem({ id: uuid(301), startsAt: new Date("2026-11-12T16:00:00.000Z") }),
			anItem({
				id: uuid(302),
				ownerId: "u2",
				createdBy: "u2",
				startsAt: new Date("2026-11-12T16:00:00.000Z"),
			}),
			anItem({ id: uuid(303), ownerId: "u2", createdBy: "u1", type: "note" }),
		);

		expect(await listIds("u1")).toEqual([uuid(301)]);
		expect(await listIds("u2")).toEqual([uuid(302), uuid(303)]);
		expect(await listIds("nobody")).toEqual([]);
	});

	it("AC4: does not return done or cancelled items", async () => {
		await seed(
			anItem({
				id: uuid(401),
				type: "task",
				status: "done",
				dueAt: new Date("2026-11-12T08:00:00.000Z"),
			}),
			anItem({
				id: uuid(402),
				status: "cancelled",
				startsAt: new Date("2026-11-12T09:00:00.000Z"),
			}),
			anItem({ id: uuid(403), type: "note", status: "done" }),
			anItem({ id: uuid(404), type: "note", status: "cancelled" }),
			anItem({ id: uuid(405), type: "note" }),
			anItem({ id: uuid(406), startsAt: new Date("2026-11-12T11:00:00.000Z") }),
		);

		expect(await listIds()).toEqual([uuid(405), uuid(406)]);
	});
});
