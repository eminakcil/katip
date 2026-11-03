// ListToday acceptance criteria (issue #6).
//
// Examples use a user in Europe/Istanbul (UTC+3, no DST).
//
// AC1 With the clock at 2026-11-11T21:30:00Z, ListToday returns
//     day "2026-11-12", timezone "Europe/Istanbul", and the items ListItems
//     returns for 2026-11-12, in the same order.
// AC2 With the clock at 2026-11-11T20:59:00Z, day is "2026-11-11" (the
//     previous local day).
// AC3 An unknown user returns { kind: "unknown_user" }.

import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock, InMemoryStore } from "../../test/fakes";
import type { Item } from "../domain/types";
import { createListItems } from "./list-items";
import { createListToday } from "./list-today";

let store: InMemoryStore;
let clock: FakeClock;
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

function task(dueAt: string, overrides: Partial<Item> = {}): Item {
	return anItem({ type: "task", dueAt: new Date(dueAt), ...overrides });
}

async function seed(...items: Item[]): Promise<void> {
	for (const item of items) await store.repos.items.insert(item);
}

function listToday(userId = "u1") {
	return createListToday({ repos: store.repos, clock })({ userId });
}

beforeEach(async () => {
	counter = 0;
	clock = new FakeClock("2026-11-11T21:30:00.000Z");
	store = new InMemoryStore()
		.addUser({ id: "u1", timezone: "Europe/Istanbul" })
		.addUser({ id: "u2", timezone: "Europe/Istanbul" })
		.addUser({ id: "ny", timezone: "America/New_York" });

	// Inserted out of order so that the expected order comes from sorting.
	await seed(
		event("2026-11-12T16:00:00.000Z", {
			id: "nov12-ev-1900",
			title: "Yayın izle",
		}),
		task("2026-11-11T21:00:00.000Z", {
			id: "nov12-allday-task",
			title: "Araba muayenesi",
			allDay: true,
		}),
		task("2026-11-12T07:00:00.000Z", {
			id: "nov12-task-1000",
			title: "Fatura",
		}),
		event("2026-11-11T20:59:00.000Z", { id: "nov11-ev-2359", title: "Gece" }),
		event("2026-11-11T09:00:00.000Z", { id: "nov11-ev-1200", title: "Öğle" }),
		event("2026-11-12T21:00:00.000Z", { id: "nov13-ev-0000", title: "Yarın" }),
		event("2026-11-12T16:00:00.000Z", {
			id: "other-user",
			ownerId: "u2",
			createdBy: "u2",
		}),
	);
});

describe("ListToday", () => {
	it("AC1: returns the local day, the timezone and that day's items", async () => {
		const result = await listToday();

		expect(result).toEqual({
			kind: "listed",
			day: "2026-11-12",
			timezone: "Europe/Istanbul",
			items: [
				expect.objectContaining({ id: "nov12-allday-task" }),
				expect.objectContaining({ id: "nov12-task-1000" }),
				expect.objectContaining({ id: "nov12-ev-1900" }),
			],
		});
	});

	it("AC1: items equal what ListItems returns for that day, in the same order", async () => {
		const today = await listToday();
		const listed = await createListItems({ repos: store.repos })({
			userId: "u1",
			day: "2026-11-12",
		});

		expect(listed.kind).toBe("listed");
		if (today.kind !== "listed" || listed.kind !== "listed") {
			throw new Error("expected listed results");
		}
		expect(today.items).toEqual(listed.items);
		expect(today.items.map((i) => i.id)).toEqual([
			"nov12-allday-task",
			"nov12-task-1000",
			"nov12-ev-1900",
		]);
	});

	it("AC1: reads the time from the Clock on every call", async () => {
		const run = createListToday({ repos: store.repos, clock });

		const first = await run({ userId: "u1" });
		clock.set("2026-11-12T21:00:00.000Z"); // 00:00 local, 13 Nov
		const second = await run({ userId: "u1" });

		expect(first).toMatchObject({ kind: "listed", day: "2026-11-12" });
		expect(second).toMatchObject({
			kind: "listed",
			day: "2026-11-13",
			items: [expect.objectContaining({ id: "nov13-ev-0000" })],
		});
	});

	it("AC2: one minute before local midnight is still the previous local day", async () => {
		clock.set("2026-11-11T20:59:00.000Z"); // 23:59 local, 11 Nov

		const result = await listToday();

		expect(result).toEqual({
			kind: "listed",
			day: "2026-11-11",
			timezone: "Europe/Istanbul",
			items: [
				expect.objectContaining({ id: "nov11-ev-1200" }),
				expect.objectContaining({ id: "nov11-ev-2359" }),
			],
		});
	});

	it("AC2: the local day follows the user's own timezone, not Istanbul's", async () => {
		// 2026-11-12T03:00Z is 12 Nov in Istanbul but 22:00 on 11 Nov in New York.
		clock.set("2026-11-12T03:00:00.000Z");
		await seed(
			event("2026-11-11T23:00:00.000Z", {
				id: "ny-nov11-1800",
				ownerId: "ny",
				createdBy: "ny",
			}),
			event("2026-11-12T16:00:00.000Z", {
				id: "ny-nov12-1100",
				ownerId: "ny",
				createdBy: "ny",
			}),
		);

		const result = await listToday("ny");

		expect(result).toEqual({
			kind: "listed",
			day: "2026-11-11",
			timezone: "America/New_York",
			items: [expect.objectContaining({ id: "ny-nov11-1800" })],
		});
	});

	it("AC3: an unknown user returns unknown_user", async () => {
		expect(await listToday("nobody")).toEqual({ kind: "unknown_user" });
	});
});
