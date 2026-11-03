// ListItems acceptance criteria (issue #2).
//
// Examples use a user in Europe/Istanbul (UTC+3, no DST) and the day
// 2026-11-12, i.e. the UTC range [2026-11-11T21:00Z, 2026-11-12T21:00Z).
//
// AC1 ListItems({ userId, day }) returns the user's open items whose time falls
//     inside that local day. Event/reminder time is startsAt; task time is dueAt.
// AC2 Day boundaries follow the user's timezone: 00:00 local is included,
//     00:00 next local day is excluded, 23:59 previous local day is excluded.
// AC3 Items of other users are never returned. Notes are never returned.
// AC4 Items with status done or cancelled are not returned.
// AC5 Ordering: all-day items first (by title), then timed items by time asc.
// AC6 Unknown user → { kind: "unknown_user" }. A day that is not a valid
//     YYYY-MM-DD calendar date → { kind: "invalid_day" }.
// (AC7, the Drizzle repository, is covered in packages/db.)

import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryStore } from "../../test/fakes";
import type { Item } from "../domain/types";
import { createListItems, type ListItemsResult } from "./list-items";

const DAY = "2026-11-12";
const DAY_START = "2026-11-11T21:00:00.000Z"; // 00:00 local, 12 Nov
const DAY_END = "2026-11-12T21:00:00.000Z"; // 00:00 local, 13 Nov

let store: InMemoryStore;
let counter = 0;

function anItem(overrides: Partial<Item> = {}): Item {
	counter += 1;
	return {
		id: `item-${counter}`,
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

function event(startsAt: string, overrides: Partial<Item> = {}): Item {
	return anItem({ type: "event", startsAt: new Date(startsAt), ...overrides });
}

function reminder(startsAt: string, overrides: Partial<Item> = {}): Item {
	return anItem({
		type: "reminder",
		startsAt: new Date(startsAt),
		...overrides,
	});
}

function task(dueAt: string, overrides: Partial<Item> = {}): Item {
	return anItem({ type: "task", dueAt: new Date(dueAt), ...overrides });
}

async function seed(...items: Item[]): Promise<void> {
	for (const item of items) await store.repos.items.insert(item);
}

function list(userId = "u1", day = DAY): Promise<ListItemsResult> {
	return createListItems({ repos: store.repos })({ userId, day });
}

async function listedIds(userId = "u1", day = DAY): Promise<string[]> {
	const result = await list(userId, day);
	if (result.kind !== "listed") {
		throw new Error(`expected listed, got ${result.kind}`);
	}
	return result.items.map((item) => item.id);
}

beforeEach(() => {
	counter = 0;
	store = new InMemoryStore()
		.addUser({ id: "u1", timezone: "Europe/Istanbul" })
		.addUser({ id: "u2", timezone: "Europe/Istanbul" });
});

describe("ListItems", () => {
	it("AC1: returns open events, reminders and tasks of the local day", async () => {
		await seed(
			event("2026-11-12T16:00:00.000Z", { id: "ev" }), // 19:00 local
			reminder("2026-11-12T07:15:00.000Z", { id: "rem" }), // 10:15 local
			task("2026-11-12T11:00:00.000Z", { id: "tsk" }), // 14:00 local
			event("2026-11-13T16:00:00.000Z", { id: "tomorrow" }),
			event("2026-11-10T16:00:00.000Z", { id: "two-days-ago" }),
		);

		expect(await listedIds()).toEqual(["rem", "tsk", "ev"]);
	});

	it("AC1: returns items unchanged, as stored", async () => {
		const stored = event("2026-11-12T16:00:00.000Z", {
			id: "ev",
			title: "Yayın izle",
			scope: "work",
			priority: "high",
			sourceInputId: "input-1",
		});
		await seed(stored);

		expect(await list()).toEqual({ kind: "listed", items: [stored] });
	});

	it("AC1: a task's time is dueAt, an event's and reminder's time is startsAt", async () => {
		await seed(
			// Task due today but with a stray startsAt on another day: included.
			task(`${DAY}T11:00:00.000Z`, {
				id: "task-due-today",
				startsAt: new Date("2026-11-20T11:00:00.000Z"),
			}),
			// Task with startsAt today but due another day: excluded.
			task("2026-11-20T11:00:00.000Z", {
				id: "task-due-later",
				startsAt: new Date(`${DAY}T11:00:00.000Z`),
			}),
			// Event starting today with a stray dueAt on another day: included.
			event(`${DAY}T12:00:00.000Z`, {
				id: "event-today",
				dueAt: new Date("2026-11-20T12:00:00.000Z"),
			}),
			// Reminder with only a dueAt today (no startsAt): excluded.
			anItem({
				id: "reminder-no-start",
				type: "reminder",
				dueAt: new Date(`${DAY}T13:00:00.000Z`),
			}),
		);

		expect(await listedIds()).toEqual(["task-due-today", "event-today"]);
	});

	it("AC1: an empty day returns an empty list", async () => {
		await seed(event("2026-11-13T16:00:00.000Z"));

		expect(await list()).toEqual({ kind: "listed", items: [] });
	});

	it("AC2: 00:00 local is included, 00:00 next day and 23:59 previous day are excluded", async () => {
		await seed(
			event(DAY_START, { id: "local-midnight" }),
			event(DAY_END, { id: "next-local-midnight" }),
			event("2026-11-11T20:59:00.000Z", { id: "prev-day-23-59" }),
			event("2026-11-12T20:59:00.000Z", { id: "local-23-59" }),
		);

		expect(await listedIds()).toEqual(["local-midnight", "local-23-59"]);
	});

	it("AC2: boundaries apply to tasks (dueAt) too", async () => {
		await seed(
			task(DAY_START, { id: "due-local-midnight" }),
			task(DAY_END, { id: "due-next-local-midnight" }),
			task("2026-11-11T20:59:00.000Z", { id: "due-prev-day" }),
		);

		expect(await listedIds()).toEqual(["due-local-midnight"]);
	});

	it("AC2: the same instants map to a different day for a UTC user", async () => {
		store.addUser({ id: "utc", timezone: "UTC" });
		await seed(
			event("2026-11-11T21:00:00.000Z", { id: "utc-11th", ownerId: "utc" }),
			event("2026-11-12T00:00:00.000Z", { id: "utc-midnight", ownerId: "utc" }),
			event("2026-11-12T22:00:00.000Z", { id: "utc-22", ownerId: "utc" }),
			event("2026-11-13T00:00:00.000Z", { id: "utc-13th", ownerId: "utc" }),
		);

		expect(await listedIds("utc")).toEqual(["utc-midnight", "utc-22"]);
	});

	it("AC2: a 25-hour day across a DST change uses the zone's real offsets", async () => {
		// America/New_York leaves DST on Sunday 2026-11-01: the local day runs
		// from 04:00Z (EDT, UTC-4) to 2026-11-02T05:00Z (EST, UTC-5).
		store.addUser({ id: "ny", timezone: "America/New_York" });
		await seed(
			event("2026-11-01T03:59:00.000Z", { id: "before", ownerId: "ny" }),
			event("2026-11-01T04:00:00.000Z", { id: "start", ownerId: "ny" }),
			event("2026-11-02T04:30:00.000Z", { id: "late-23-30", ownerId: "ny" }),
			event("2026-11-02T05:00:00.000Z", { id: "end", ownerId: "ny" }),
		);

		expect(await listedIds("ny", "2026-11-01")).toEqual([
			"start",
			"late-23-30",
		]);
	});

	it("AC3: never returns items of other users", async () => {
		await seed(
			event("2026-11-12T16:00:00.000Z", { id: "mine" }),
			event("2026-11-12T16:00:00.000Z", {
				id: "theirs",
				ownerId: "u2",
				createdBy: "u2",
			}),
			task("2026-11-12T11:00:00.000Z", {
				id: "theirs-created-by-me",
				ownerId: "u2",
			}),
		);

		expect(await listedIds("u1")).toEqual(["mine"]);
		expect(await listedIds("u2")).toEqual(["theirs-created-by-me", "theirs"]);
	});

	it("AC3: never returns notes", async () => {
		await seed(
			anItem({ id: "note", type: "note", title: "Kitap önerisi" }),
			event("2026-11-12T16:00:00.000Z", { id: "ev" }),
		);

		expect(await listedIds()).toEqual(["ev"]);
	});

	it("AC4: does not return done or cancelled items", async () => {
		await seed(
			task("2026-11-12T08:00:00.000Z", { id: "done", status: "done" }),
			event("2026-11-12T09:00:00.000Z", {
				id: "cancelled",
				status: "cancelled",
			}),
			reminder("2026-11-12T10:00:00.000Z", {
				id: "rem-done",
				status: "done",
			}),
			event("2026-11-12T11:00:00.000Z", { id: "open" }),
		);

		expect(await listedIds()).toEqual(["open"]);
	});

	it("AC5: all-day items first by title, then timed items by time ascending", async () => {
		await seed(
			event("2026-11-12T16:00:00.000Z", { id: "timed-19-00", title: "Akşam" }),
			task(DAY_START, { id: "allday-kira", title: "Kira öde", allDay: true }),
			reminder(DAY_START, { id: "timed-00-00", title: "Gece" }),
			task("2026-11-12T06:30:00.000Z", { id: "timed-09-30", title: "Banka" }),
			event(DAY_START, {
				id: "allday-anne",
				title: "Annemin doğum günü",
				allDay: true,
			}),
			task(DAY_START, { id: "allday-market", title: "Market", allDay: true }),
		);

		expect(await listedIds()).toEqual([
			"allday-anne",
			"allday-kira",
			"allday-market",
			"timed-00-00",
			"timed-09-30",
			"timed-19-00",
		]);
	});

	it("AC6: an unknown user returns unknown_user", async () => {
		await seed(event("2026-11-12T16:00:00.000Z", { ownerId: "u1" }));

		expect(await list("missing")).toEqual({ kind: "unknown_user" });
	});

	it.each([
		["empty string", ""],
		["month 13", "2026-13-01"],
		["month 00", "2026-00-10"],
		["day 00", "2026-11-00"],
		["30 February", "2026-02-30"],
		["29 February in a non-leap year", "2026-02-29"],
		["31 November", "2026-11-31"],
		["missing zero padding", "2026-11-1"],
		["day-month-year order", "12-11-2026"],
		["slashes", "2026/11/12"],
		["a timestamp", "2026-11-12T00:00:00Z"],
		["trailing space", "2026-11-12 "],
		["free text", "bugün"],
	])("AC6: %s is invalid_day", async (_label, day) => {
		expect(await list("u1", day)).toEqual({ kind: "invalid_day" });
	});

	it("AC6: 29 February in a leap year is a valid day", async () => {
		await seed(event("2028-02-29T09:00:00.000Z", { id: "leap" }));

		expect(await listedIds("u1", "2028-02-29")).toEqual(["leap"]);
	});
});
