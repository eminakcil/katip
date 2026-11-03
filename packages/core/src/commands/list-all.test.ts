// ListAll acceptance criteria (issue #22).
//
// AC1 Dated items are all open events, reminders and tasks (time = startsAt
//     for events and reminders, dueAt for tasks), with no date bound: items
//     before today (overdue/past) are included as well as today and future.
// AC2 Dated items are grouped by the user's local calendar day ("YYYY-MM-DD",
//     user's timezone, DST-safe). Days ascending (oldest first), empty days
//     left out. Within a day: all-day items first by title, then timed items by
//     time, then title (same as /bugun and /hafta).
// AC3 Undated items are open items of type `note`. They come after all dated
//     items, oldest first by createdAt, ties broken by title.
// AC4 Items with status done or cancelled, and other users' items, are never
//     returned.
// AC5 At most 20 items, counted across dated and undated together in display
//     order (dated first, then undated). Also reports how many open items were
//     left out (total − 20, or 0 when there are 20 or fewer).
// AC6 An unknown userId returns unknown_user.
//
// Interface expected by these tests:
//   createListAll({ repos, clock })({ userId }) =>
//     | { kind: "listed"; timezone: string;
//         days: { day: string; items: Item[] }[]; undated: Item[]; more: number }
//     | { kind: "unknown_user" }
// (also declared as ListAllResult in packages/telegram/src/ports.ts). Reads
// open items through ItemRepository.listOpen(ownerId), which has no date bound.
//
// Most examples use a user in Europe/Istanbul (UTC+3, no DST) with the clock at
// 2026-11-12T06:00:00Z = 09:00 on Thursday 12 November local.

import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock, InMemoryStore } from "../../test/fakes";
import type { Item } from "../domain/types";
import { createListAll } from "./list-all";
import { createListItems } from "./list-items";

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

function note(createdAt: string, overrides: Partial<Item> = {}): Item {
	return anItem({ type: "note", createdAt: new Date(createdAt), ...overrides });
}

async function seed(...items: Item[]): Promise<void> {
	for (const item of items) await store.repos.items.insert(item);
}

function listAll(userId = "u1") {
	return createListAll({ repos: store.repos, clock })({ userId });
}

/** Result reduced to day keys and item ids, for exact comparisons. */
async function ids(userId = "u1") {
	const result = await listAll(userId);
	if (result.kind !== "listed") return result;
	return {
		kind: result.kind,
		timezone: result.timezone,
		days: result.days.map((d) => ({
			day: d.day,
			ids: d.items.map((i) => i.id),
		})),
		undated: result.undated.map((i) => i.id),
		more: result.more,
	};
}

const DEFAULT_DAYS = [
	{ day: "2026-10-05", ids: ["oct05-ev-1000"] },
	{ day: "2026-11-11", ids: ["nov11-rem-2330"] },
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
	{ day: "2026-11-13", ids: ["nov13-ev-0130"] },
	{ day: "2027-03-01", ids: ["mar01-ev-1300"] },
];

const DEFAULT_UNDATED = ["note-kitap", "note-kapi", "note-wifi"];

beforeEach(async () => {
	counter = 0;
	clock = new FakeClock("2026-11-12T06:00:00.000Z"); // 09:00, 12 Nov local
	store = new InMemoryStore()
		.addUser({ id: "u1", timezone: "Europe/Istanbul" })
		.addUser({ id: "u2", timezone: "Europe/Istanbul" })
		.addUser({ id: "ny", timezone: "America/New_York" })
		.addUser({ id: "cap", timezone: "Europe/Istanbul" });

	// Inserted out of order so that the expected order comes from sorting.
	await seed(
		note("2026-11-05T10:00:00.000Z", {
			id: "note-wifi",
			title: "Wi-Fi şifresi kutunun altında",
		}),
		event("2027-03-01T10:00:00.000Z", {
			id: "mar01-ev-1300",
			title: "Uzak gelecek",
		}),
		event("2026-11-12T16:00:00.000Z", {
			id: "nov12-ev-1900-yayin",
			title: "Yayın izle",
		}),
		// 01:30 on 13 Nov local, still 12 Nov in UTC.
		event("2026-11-12T22:30:00.000Z", {
			id: "nov13-ev-0130",
			title: "Gece uçuşu",
		}),
		task("2026-11-11T21:00:00.000Z", {
			id: "nov12-allday-fatura",
			title: "Faturayı öde",
			allDay: true,
		}),
		note("2026-11-01T08:00:00.000Z", {
			id: "note-kitap",
			title: "Kitap önerisi",
		}),
		task("2026-11-12T07:00:00.000Z", {
			id: "nov12-task-1000",
			title: "Rapor gönder",
		}),
		// Past (overdue): 23:30 yesterday local.
		reminder("2026-11-11T20:30:00.000Z", {
			id: "nov11-rem-2330",
			title: "İlaç al",
		}),
		event("2026-11-12T16:00:00.000Z", {
			id: "nov12-ev-1900-antrenman",
			title: "Antrenman",
		}),
		// Same createdAt as note-wifi: tie broken by title.
		note("2026-11-05T10:00:00.000Z", {
			id: "note-kapi",
			title: "Arka kapı kodu",
		}),
		// 00:00 on 12 Nov local = 11 Nov in UTC.
		event("2026-11-11T21:00:00.000Z", {
			id: "nov12-allday-annem",
			title: "Annemi ara",
			allDay: true,
		}),
		// Past: 10:00 on 5 Oct local.
		event("2026-10-05T07:00:00.000Z", {
			id: "oct05-ev-1000",
			title: "Eski toplantı",
		}),
		// Another user's items.
		event("2026-11-13T10:00:00.000Z", {
			id: "u2-event",
			ownerId: "u2",
			createdBy: "u2",
		}),
		note("2026-11-02T10:00:00.000Z", {
			id: "u2-note",
			ownerId: "u2",
			createdBy: "u2",
		}),
	);
});

describe("ListAll", () => {
	it("AC1: lists every open event, reminder and task, past, today and future, plus notes", async () => {
		expect(await ids()).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: DEFAULT_DAYS,
			undated: DEFAULT_UNDATED,
			more: 0,
		});
	});

	it("AC1: has no date bound: the result does not depend on the clock", async () => {
		const expected = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: DEFAULT_DAYS,
			undated: DEFAULT_UNDATED,
			more: 0,
		};

		clock.set("2030-01-01T09:00:00.000Z"); // everything is in the past
		expect(await ids()).toEqual(expected);
		clock.set("2020-01-01T09:00:00.000Z"); // everything is in the future
		expect(await ids()).toEqual(expected);
	});

	it("AC1: a task's time is dueAt; an event's and reminder's time is startsAt", async () => {
		await seed(
			anItem({
				id: "task-due-nov20",
				type: "task",
				title: "Görev",
				dueAt: new Date("2026-11-20T07:00:00.000Z"),
				startsAt: new Date("2026-12-24T07:00:00.000Z"),
			}),
			anItem({
				id: "event-starts-nov21",
				type: "event",
				title: "Etkinlik",
				startsAt: new Date("2026-11-21T07:00:00.000Z"),
				dueAt: new Date("2026-12-25T07:00:00.000Z"),
			}),
			anItem({
				id: "reminder-starts-nov22",
				type: "reminder",
				title: "Hatırlatma",
				startsAt: new Date("2026-11-22T07:00:00.000Z"),
				dueAt: new Date("2026-12-26T07:00:00.000Z"),
			}),
		);

		const result = await ids();
		if (result.kind !== "listed") throw new Error("expected listed");

		expect(result.days.slice(4)).toEqual([
			{ day: "2026-11-20", ids: ["task-due-nov20"] },
			{ day: "2026-11-21", ids: ["event-starts-nov21"] },
			{ day: "2026-11-22", ids: ["reminder-starts-nov22"] },
			{ day: "2027-03-01", ids: ["mar01-ev-1300"] },
		]);
	});

	it("AC1: returns full, unchanged Item objects", async () => {
		const result = await listAll();
		if (result.kind !== "listed") throw new Error("expected listed");

		expect(result.days[0]).toEqual({
			day: "2026-10-05",
			items: [
				{
					id: "oct05-ev-1000",
					ownerId: "u1",
					createdBy: "u1",
					type: "event",
					title: "Eski toplantı",
					scope: "personal",
					priority: "normal",
					status: "open",
					startsAt: new Date("2026-10-05T07:00:00.000Z"),
					dueAt: null,
					allDay: false,
					sourceInputId: null,
					createdAt: new Date("2026-11-01T09:00:00.000Z"),
				},
			],
		});
		expect(result.undated[0]).toEqual({
			id: "note-kitap",
			ownerId: "u1",
			createdBy: "u1",
			type: "note",
			title: "Kitap önerisi",
			scope: "personal",
			priority: "normal",
			status: "open",
			startsAt: null,
			dueAt: null,
			allDay: false,
			sourceInputId: null,
			createdAt: new Date("2026-11-01T08:00:00.000Z"),
		});
	});

	it("AC2: groups by local day (not UTC day), oldest day first, empty days left out", async () => {
		const result = await ids();
		if (result.kind !== "listed") throw new Error("expected listed");

		expect(result.days.map((d) => d.day)).toEqual([
			"2026-10-05",
			"2026-11-11",
			"2026-11-12",
			"2026-11-13",
			"2027-03-01",
		]);
		// 2026-11-11T21:00Z is 12 Nov local; 2026-11-12T22:30Z is 13 Nov local.
		expect(result.days[2]?.ids).toContain("nov12-allday-annem");
		expect(result.days[3]).toEqual({
			day: "2026-11-13",
			ids: ["nov13-ev-0130"],
		});
	});

	it("AC2: within a day, all-day items first by title, then timed items by time, then title", async () => {
		const result = await ids();
		if (result.kind !== "listed") throw new Error("expected listed");

		expect(result.days[2]).toEqual({
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

	it("AC2: each day's items match the order ListItems returns for that day", async () => {
		const all = await listAll();
		if (all.kind !== "listed") throw new Error("expected listed");
		const listItems = createListItems({ repos: store.repos });

		for (const { day, items } of all.days) {
			const listed = await listItems({ userId: "u1", day });
			if (listed.kind !== "listed") throw new Error("expected listed");
			expect(items).toEqual(listed.items);
		}
	});

	it("AC2: grouping uses the user's own timezone, across a DST change", async () => {
		// New York leaves DST on 2026-11-01 at 06:00Z (EDT UTC-4 → EST UTC-5).
		const ny = { ownerId: "ny", createdBy: "ny" };
		await seed(
			// 23:30 EST on 1 Nov (2 Nov in UTC).
			event("2026-11-02T04:30:00.000Z", {
				...ny,
				id: "ny-nov01-2330",
				title: "Gece",
			}),
			// 01:30 EDT on 1 Nov.
			event("2026-11-01T05:30:00.000Z", {
				...ny,
				id: "ny-nov01-0130",
				title: "Sabah",
			}),
			// 23:30 EDT on 28 Oct (29 Oct in UTC).
			event("2026-10-29T03:30:00.000Z", {
				...ny,
				id: "ny-oct28-2330",
				title: "Akşam",
			}),
			// 00:00 EST on 2 Nov.
			event("2026-11-02T05:00:00.000Z", {
				...ny,
				id: "ny-nov02-0000",
				title: "Gece yarısı",
			}),
		);

		expect(await ids("ny")).toEqual({
			kind: "listed",
			timezone: "America/New_York",
			days: [
				{ day: "2026-10-28", ids: ["ny-oct28-2330"] },
				{ day: "2026-11-01", ids: ["ny-nov01-0130", "ny-nov01-2330"] },
				{ day: "2026-11-02", ids: ["ny-nov02-0000"] },
			],
			undated: [],
			more: 0,
		});
	});

	it("AC3: notes come after dated items, oldest first by createdAt, ties broken by title", async () => {
		const result = await ids();
		if (result.kind !== "listed") throw new Error("expected listed");

		expect(result.undated).toEqual([
			"note-kitap", // created 1 Nov
			"note-kapi", // created 5 Nov, "Arka kapı kodu"
			"note-wifi", // created 5 Nov, "Wi-Fi şifresi kutunun altında"
		]);
		const datedIds = result.days.flatMap((d) => d.ids);
		for (const id of DEFAULT_UNDATED) expect(datedIds).not.toContain(id);
	});

	it("AC3: a user with only notes gets no days and the notes in order", async () => {
		await seed(
			note("2026-11-03T10:00:00.000Z", {
				id: "cap-note-b",
				ownerId: "cap",
				createdBy: "cap",
				title: "B notu",
			}),
			note("2026-11-02T10:00:00.000Z", {
				id: "cap-note-a",
				ownerId: "cap",
				createdBy: "cap",
				title: "Z notu",
			}),
		);

		expect(await ids("cap")).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [],
			undated: ["cap-note-a", "cap-note-b"],
			more: 0,
		});
	});

	it("AC4: done and cancelled items (dated or notes) are never returned", async () => {
		await seed(
			event("2026-10-01T10:00:00.000Z", { id: "oct01-done", status: "done" }),
			task("2026-11-12T08:00:00.000Z", {
				id: "nov12-cancelled",
				status: "cancelled",
			}),
			reminder("2026-12-01T08:00:00.000Z", {
				id: "dec01-done",
				status: "done",
			}),
			note("2026-10-01T10:00:00.000Z", { id: "note-done", status: "done" }),
			note("2026-10-01T11:00:00.000Z", {
				id: "note-cancelled",
				status: "cancelled",
			}),
		);

		expect(await ids()).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: DEFAULT_DAYS,
			undated: DEFAULT_UNDATED,
			more: 0,
		});
	});

	it("AC4: never returns another user's items", async () => {
		expect(await ids("u2")).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [{ day: "2026-11-13", ids: ["u2-event"] }],
			undated: ["u2-note"],
			more: 0,
		});
	});

	it("AC4: a user with no open items gets empty lists and nothing left out", async () => {
		await seed(
			event("2026-11-12T10:00:00.000Z", {
				id: "cap-done",
				ownerId: "cap",
				createdBy: "cap",
				status: "done",
			}),
		);

		expect(await ids("cap")).toEqual({
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [],
			undated: [],
			more: 0,
		});
	});

	describe("20-item cap", () => {
		const owner = { ownerId: "cap", createdBy: "cap" };

		/** `count` timed events on one local day, 08:00, 09:00, … local. Inserted in reverse. */
		function eventsOn(day: string, count: number, prefix: string): Item[] {
			const items: Item[] = [];
			for (let i = 0; i < count; i++) {
				const hour = String(5 + i).padStart(2, "0"); // UTC; +3 local
				items.push(
					event(`${day}T${hour}:00:00.000Z`, {
						...owner,
						id: `${prefix}-${String(i + 1).padStart(2, "0")}`,
						title: `Etkinlik ${prefix} ${i + 1}`,
					}),
				);
			}
			return items.reverse();
		}

		/** `count` notes created one day apart from 1 Oct. Inserted in reverse. */
		function notes(count: number): Item[] {
			const items: Item[] = [];
			for (let i = 0; i < count; i++) {
				const date = String(1 + i).padStart(2, "0");
				items.push(
					note(`2026-10-${date}T10:00:00.000Z`, {
						...owner,
						id: `note-${String(i + 1).padStart(2, "0")}`,
						title: `Not ${i + 1}`,
					}),
				);
			}
			return items.reverse();
		}

		it("AC5: 18 dated + 7 notes shows all dated items and the 2 oldest notes; 5 left out", async () => {
			await seed(
				...eventsOn("2026-11-20", 10, "a"),
				...eventsOn("2026-11-21", 8, "b"),
				...notes(7),
			);

			const result = await ids("cap");
			if (result.kind !== "listed") throw new Error("expected listed");

			expect(result.days).toEqual([
				{
					day: "2026-11-20",
					ids: [
						"a-01",
						"a-02",
						"a-03",
						"a-04",
						"a-05",
						"a-06",
						"a-07",
						"a-08",
						"a-09",
						"a-10",
					],
				},
				{
					day: "2026-11-21",
					ids: ["b-01", "b-02", "b-03", "b-04", "b-05", "b-06", "b-07", "b-08"],
				},
			]);
			expect(result.undated).toEqual(["note-01", "note-02"]);
			expect(result.more).toBe(5);
		});

		it("AC5: the cap can cut inside a day and then leaves out all notes and later days", async () => {
			await seed(
				...eventsOn("2026-11-20", 10, "a"),
				...eventsOn("2026-11-21", 8, "b"),
				...eventsOn("2026-11-22", 5, "c"),
				...eventsOn("2026-11-23", 1, "d"),
				...notes(2),
			);

			const result = await ids("cap");
			if (result.kind !== "listed") throw new Error("expected listed");

			expect(result.days.map((d) => d.day)).toEqual([
				"2026-11-20",
				"2026-11-21",
				"2026-11-22",
			]);
			expect(result.days[2]).toEqual({
				day: "2026-11-22",
				ids: ["c-01", "c-02"],
			});
			expect(result.days.flatMap((d) => d.ids)).toHaveLength(20);
			expect(result.undated).toEqual([]);
			expect(result.more).toBe(6); // 26 open items − 20
		});

		it("AC5: with exactly 20 open items, all are shown and nothing is left out", async () => {
			await seed(...eventsOn("2026-11-20", 15, "a"), ...notes(5));

			const result = await ids("cap");
			if (result.kind !== "listed") throw new Error("expected listed");

			expect(result.days).toHaveLength(1);
			expect(result.days[0]?.ids).toHaveLength(15);
			expect(result.undated).toEqual([
				"note-01",
				"note-02",
				"note-03",
				"note-04",
				"note-05",
			]);
			expect(result.more).toBe(0);
		});

		it("AC5: with 21 open items, the newest note is left out and 1 is reported", async () => {
			await seed(...eventsOn("2026-11-20", 15, "a"), ...notes(6));

			const result = await ids("cap");
			if (result.kind !== "listed") throw new Error("expected listed");

			expect(result.days[0]?.ids).toHaveLength(15);
			expect(result.undated).toEqual([
				"note-01",
				"note-02",
				"note-03",
				"note-04",
				"note-05",
			]);
			expect(result.more).toBe(1);
		});

		it("AC5: with 21 dated items, the latest one is cut and 1 is reported", async () => {
			await seed(
				...eventsOn("2026-11-20", 12, "a"),
				...eventsOn("2026-11-21", 9, "b"),
			);

			const result = await ids("cap");
			if (result.kind !== "listed") throw new Error("expected listed");

			expect(result.days[0]?.ids).toHaveLength(12);
			expect(result.days[1]).toEqual({
				day: "2026-11-21",
				ids: ["b-01", "b-02", "b-03", "b-04", "b-05", "b-06", "b-07", "b-08"],
			});
			expect(result.undated).toEqual([]);
			expect(result.more).toBe(1);
		});

		it("AC5: done and cancelled items do not count towards the cap or the left-out count", async () => {
			await seed(
				...eventsOn("2026-11-20", 15, "a"),
				...notes(5),
				event("2026-11-25T10:00:00.000Z", {
					...owner,
					id: "cap-done",
					status: "done",
				}),
				note("2026-12-01T10:00:00.000Z", {
					...owner,
					id: "cap-note-cancelled",
					status: "cancelled",
				}),
			);

			const result = await ids("cap");
			if (result.kind !== "listed") throw new Error("expected listed");

			expect(result.undated).toHaveLength(5);
			expect(result.more).toBe(0);
		});
	});

	it("AC6: an unknown user returns unknown_user", async () => {
		expect(await listAll("nobody")).toEqual({ kind: "unknown_user" });
	});
});
