// ListWeek acceptance criteria (issue #9).
//
// "Week" = the 7 local calendar days starting today in the user's timezone.
// Most examples use a user in Europe/Istanbul (UTC+3, no DST) with the clock at
// 2026-11-11T21:30:00Z = 00:30 on Thursday 12 November local. The week is then
// 12–18 November; the window is [2026-11-11T21:00Z, 2026-11-18T21:00Z).
//
// AC1 Returns the user's open items from 00:00 today (local) up to, but not
//     including, 00:00 on the 8th day (local), using the user's timezone from
//     the user record and the Clock port for "today".
// AC2 Items are grouped by local calendar day ("YYYY-MM-DD"), days in
//     ascending order. Days with no items are left out.
// AC3 Within a day, items use the same order as ListItems: all-day items first
//     (by title), then timed items by time (then title).
// AC4 Done and cancelled items are not listed.
// AC5 An unknown user returns { kind: "unknown_user" }.
// AC6 Day boundaries follow the user's timezone: in Europe/Istanbul, an item at
//     23:30 local on the 7th day is included, and an item at 00:00 local on the
//     8th day is not. The result also carries the timezone, for rendering.
//
// Result shape (also declared as ListWeekResult in packages/telegram/src/ports.ts):
//   { kind: "listed"; timezone: string; days: { day: string; items: Item[] }[] }
//   | { kind: "unknown_user" }

import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock, InMemoryStore } from "../../test/fakes";
import type { Item } from "../domain/types";
import { createListItems } from "./list-items";
import { createListWeek } from "./list-week";

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

function listWeek(userId = "u1") {
	return createListWeek({ repos: store.repos, clock })({ userId });
}

/** Result reduced to day keys and item ids, for exact comparisons. */
async function idsByDay(userId = "u1") {
	const result = await listWeek(userId);
	if (result.kind !== "listed") return result;
	return {
		kind: result.kind,
		timezone: result.timezone,
		days: result.days.map((d) => ({
			day: d.day,
			ids: d.items.map((i) => i.id),
		})),
	};
}

beforeEach(async () => {
	counter = 0;
	clock = new FakeClock("2026-11-11T21:30:00.000Z"); // 00:30, 12 Nov local
	store = new InMemoryStore()
		.addUser({ id: "u1", timezone: "Europe/Istanbul" })
		.addUser({ id: "u2", timezone: "Europe/Istanbul" })
		.addUser({ id: "ny", timezone: "America/New_York" });

	// Inserted out of order so that the expected order comes from sorting.
	await seed(
		event("2026-11-14T07:00:00.000Z", {
			id: "nov14-ev-1000",
			title: "Araç muayenesi",
		}),
		event("2026-11-12T16:00:00.000Z", {
			id: "nov12-ev-1900-yayin",
			title: "Yayın izle",
		}),
		event("2026-11-18T20:30:00.000Z", {
			id: "nov18-ev-2330",
			title: "Gece yürüyüşü",
		}),
		task("2026-11-11T21:00:00.000Z", {
			id: "nov12-allday-fatura",
			title: "Faturayı öde",
			allDay: true,
		}),
		task("2026-11-12T07:00:00.000Z", {
			id: "nov12-task-1000",
			title: "Rapor gönder",
		}),
		event("2026-11-12T16:00:00.000Z", {
			id: "nov12-ev-1900-antrenman",
			title: "Antrenman",
		}),
		event("2026-11-11T21:00:00.000Z", {
			id: "nov12-allday-annem",
			title: "Annemi ara",
			allDay: true,
		}),
		// Outside the window.
		event("2026-11-11T20:59:00.000Z", { id: "nov11-ev-2359", title: "Dün" }),
		event("2026-11-18T21:00:00.000Z", {
			id: "nov19-ev-0000",
			title: "Sekizinci gün",
		}),
		// Another user's item inside the window.
		event("2026-11-13T10:00:00.000Z", {
			id: "other-user",
			ownerId: "u2",
			createdBy: "u2",
		}),
	);
});

describe("ListWeek", () => {
	it("AC1: returns the open items from 00:00 today up to 00:00 on the 8th day, grouped by day", async () => {
		expect(await idsByDay()).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [
				{
					day: "2026-11-12",
					ids: [
						"nov12-allday-annem",
						"nov12-allday-fatura",
						"nov12-task-1000",
						"nov12-ev-1900-antrenman",
						"nov12-ev-1900-yayin",
					],
				},
				{ day: "2026-11-14", ids: ["nov14-ev-1000"] },
				{ day: "2026-11-18", ids: ["nov18-ev-2330"] },
			],
		});
	});

	it("AC1: an item at exactly 00:00 today (local) is included; one minute before is not", async () => {
		const result = await idsByDay();
		if (result.kind !== "listed") throw new Error("expected listed");
		const all = result.days.flatMap((d) => d.ids);

		expect(all).toContain("nov12-allday-annem"); // 2026-11-11T21:00Z = 00:00 local
		expect(all).not.toContain("nov11-ev-2359");
	});

	it("AC1: never returns another user's items", async () => {
		const result = await idsByDay("u2");

		expect(result).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [{ day: "2026-11-13", ids: ["other-user"] }],
		});
	});

	it("AC1: reads today from the Clock on every call", async () => {
		const run = createListWeek({ repos: store.repos, clock });

		clock.set("2026-11-12T20:59:00.000Z"); // 23:59, 12 Nov local
		const lateOnThursday = await run({ userId: "u1" });
		clock.set("2026-11-12T21:00:00.000Z"); // 00:00, 13 Nov local
		const fridayMidnight = await run({ userId: "u1" });

		expect(lateOnThursday).toMatchObject({
			kind: "listed",
			days: [
				{ day: "2026-11-12" },
				{ day: "2026-11-14" },
				{ day: "2026-11-18" },
			],
		});
		// Window is now 13–19 Nov: 12 Nov drops out, 19 Nov 00:00 comes in.
		expect(fridayMidnight).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [
				{
					day: "2026-11-14",
					items: [expect.objectContaining({ id: "nov14-ev-1000" })],
				},
				{
					day: "2026-11-18",
					items: [expect.objectContaining({ id: "nov18-ev-2330" })],
				},
				{
					day: "2026-11-19",
					items: [expect.objectContaining({ id: "nov19-ev-0000" })],
				},
			],
		});
	});

	it("AC2: groups by local day in ascending order and leaves out empty days", async () => {
		const result = await listWeek();

		expect(result).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [
				{
					day: "2026-11-12",
					items: [
						expect.objectContaining({ id: "nov12-allday-annem" }),
						expect.objectContaining({ id: "nov12-allday-fatura" }),
						expect.objectContaining({ id: "nov12-task-1000" }),
						expect.objectContaining({ id: "nov12-ev-1900-antrenman" }),
						expect.objectContaining({ id: "nov12-ev-1900-yayin" }),
					],
				},
				{
					day: "2026-11-14",
					items: [expect.objectContaining({ id: "nov14-ev-1000" })],
				},
				{
					day: "2026-11-18",
					items: [expect.objectContaining({ id: "nov18-ev-2330" })],
				},
			],
		});
	});

	it("AC2: a user with nothing in the next 7 days gets an empty list of days", async () => {
		clock.set("2026-12-01T09:00:00.000Z");

		expect(await listWeek()).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [],
		});
	});

	it("AC2: items are returned unchanged (full Item objects)", async () => {
		const result = await listWeek();
		if (result.kind !== "listed") throw new Error("expected listed");

		expect(result.days[1]?.items).toEqual([
			{
				id: "nov14-ev-1000",
				ownerId: "u1",
				createdBy: "u1",
				type: "event",
				title: "Araç muayenesi",
				scope: "personal",
				priority: "normal",
				status: "open",
				startsAt: new Date("2026-11-14T07:00:00.000Z"),
				dueAt: null,
				allDay: false,
				sourceInputId: null,
				createdAt: new Date("2026-11-01T09:00:00.000Z"),
			},
		]);
	});

	it("AC3: each day's items are in the same order ListItems returns for that day", async () => {
		const week = await listWeek();
		if (week.kind !== "listed") throw new Error("expected listed");
		const listItems = createListItems({ repos: store.repos });

		for (const { day, items } of week.days) {
			const listed = await listItems({ userId: "u1", day });
			if (listed.kind !== "listed") throw new Error("expected listed");
			expect(items).toEqual(listed.items);
		}
		expect(week.days.map((d) => d.day)).toEqual([
			"2026-11-12",
			"2026-11-14",
			"2026-11-18",
		]);
	});

	it("AC3: all-day items first by title, then timed items by time, then title", async () => {
		const result = await idsByDay();
		if (result.kind !== "listed") throw new Error("expected listed");

		expect(result.days[0]).toEqual({
			day: "2026-11-12",
			ids: [
				"nov12-allday-annem", // all-day, "Annemi ara"
				"nov12-allday-fatura", // all-day, "Faturayı öde"
				"nov12-task-1000", // 10:00
				"nov12-ev-1900-antrenman", // 19:00, "Antrenman"
				"nov12-ev-1900-yayin", // 19:00, "Yayın izle"
			],
		});
	});

	it("AC4: done and cancelled items are not listed, and a day with only those is left out", async () => {
		await seed(
			event("2026-11-13T10:00:00.000Z", { id: "nov13-done", status: "done" }),
			task("2026-11-14T08:00:00.000Z", {
				id: "nov14-cancelled",
				status: "cancelled",
			}),
			event("2026-11-15T10:00:00.000Z", {
				id: "nov15-cancelled",
				status: "cancelled",
			}),
		);

		expect(await idsByDay()).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [
				{
					day: "2026-11-12",
					ids: [
						"nov12-allday-annem",
						"nov12-allday-fatura",
						"nov12-task-1000",
						"nov12-ev-1900-antrenman",
						"nov12-ev-1900-yayin",
					],
				},
				{ day: "2026-11-14", ids: ["nov14-ev-1000"] },
				{ day: "2026-11-18", ids: ["nov18-ev-2330"] },
			],
		});
	});

	it("AC5: an unknown user returns unknown_user", async () => {
		expect(await listWeek("nobody")).toEqual({ kind: "unknown_user" });
	});

	it("AC6: in Europe/Istanbul, 23:30 on the 7th day is included and 00:00 on the 8th day is not", async () => {
		const result = await listWeek();
		if (result.kind !== "listed") throw new Error("expected listed");

		const last = result.days.at(-1);
		expect(last?.day).toBe("2026-11-18");
		expect(last?.items.map((i) => i.id)).toEqual(["nov18-ev-2330"]);
		expect(result.days.flatMap((d) => d.items.map((i) => i.id))).not.toContain(
			"nov19-ev-0000",
		);
		expect(result.timezone).toBe("Europe/Istanbul");
	});

	it("AC6: boundaries and grouping use the user's own timezone, across a DST change", async () => {
		// New York leaves DST on 2026-11-01 (EDT UTC-4 → EST UTC-5).
		// Clock: 12:00 EDT on Thursday 29 Oct. Week = 29 Oct – 4 Nov.
		// Window: [2026-10-29T04:00Z, 2026-11-05T05:00Z).
		clock.set("2026-10-29T16:00:00.000Z");
		const ny = { ownerId: "ny", createdBy: "ny" };
		await seed(
			event("2026-10-29T03:59:00.000Z", { ...ny, id: "ny-oct28-2359" }),
			event("2026-10-29T04:00:00.000Z", { ...ny, id: "ny-oct29-0000" }),
			// 23:30 EST on 1 Nov: 2 Nov in UTC and in Istanbul, 1 Nov in New York.
			event("2026-11-02T04:30:00.000Z", { ...ny, id: "ny-nov01-2330" }),
			// 23:30 EST on 4 Nov (7th day); 7×24h after the start would cut it off.
			event("2026-11-05T04:30:00.000Z", { ...ny, id: "ny-nov04-2330" }),
			event("2026-11-05T05:00:00.000Z", { ...ny, id: "ny-nov05-0000" }),
		);

		expect(await idsByDay("ny")).toEqual({
			kind: "listed",
			timezone: "America/New_York",
			days: [
				{ day: "2026-10-29", ids: ["ny-oct29-0000"] },
				{ day: "2026-11-01", ids: ["ny-nov01-2330"] },
				{ day: "2026-11-04", ids: ["ny-nov04-2330"] },
			],
		});
	});
});
