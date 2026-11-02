// CaptureInput acceptance criteria (Phase 1 sample feature).
//
// AC1  The raw input is stored before parsing, even if parsing later fails.
// AC2  The parser gets the text, the clock's "now" and the user's timezone.
// AC3  A valid event becomes an open item; its local wall time is converted to
//      UTC in the user's timezone.
// AC4  A "created" item event is recorded at the clock's time.
// AC5  Default reminders: event 30 min before start, task 09:00 local on the
//      due date, reminder at its time, note none. Past reminders are skipped.
// AC6  Each reminder is scheduled with the job queue and its job id stored.
// AC7  The input records the raw parse result, validity and model version.
// AC8  Invalid parser output is retried once; a valid retry is used.
// AC9  Two invalid outputs: nothing is created and the user is asked again.
// AC10 A task with a date but no time is an all-day item.
// AC11 Unknown users get no input, item or parser call.
// AC12 Item types not supported yet (recurring, annual) create no item.
// AC13 Item, event and reminders are written atomically.

import { beforeEach, describe, expect, it } from "vitest";

import {
	FakeClock,
	FakeJobScheduler,
	InMemoryStore,
	ScriptedParser,
	SequentialIds,
} from "../../test/fakes";
import { type CaptureInputResult, createCaptureInput } from "./capture-input";

// Thursday 6 Nov 2026, 12:00 in Istanbul (UTC+3).
const NOW = "2026-11-06T09:00:00.000Z";

const validEvent = {
	type: "event",
	title: "Yayın izle",
	scope: "personal",
	priority: "high",
	date: "2026-11-13",
	time: "19:00",
};

let clock: FakeClock;
let store: InMemoryStore;
let parser: ScriptedParser;
let jobs: FakeJobScheduler;

function capture(
	text = "Haftaya perşembe akşam 7'de yayın var, mutlaka izlemeliyim.",
) {
	const run = createCaptureInput({
		clock,
		ids: new SequentialIds(),
		parser,
		uow: store,
		repos: store.repos,
		jobs,
	});
	return run({ userId: "u1", channel: "chat", text });
}

function expectCaptured(
	result: CaptureInputResult,
): Extract<CaptureInputResult, { kind: "captured" }> {
	if (result.kind !== "captured") {
		throw new Error(`expected captured, got ${result.kind}`);
	}
	return result;
}

beforeEach(() => {
	clock = new FakeClock(NOW);
	store = new InMemoryStore().addUser({
		id: "u1",
		timezone: "Europe/Istanbul",
	});
	parser = new ScriptedParser("fake-model-1");
	jobs = new FakeJobScheduler();
});

describe("CaptureInput", () => {
	it("AC1: stores the raw input with user, channel, kind and time", async () => {
		parser.willReturn(validEvent);
		await capture("haftaya perşembe 19:00 yayın");

		expect(store.state.inputs).toHaveLength(1);
		const input = store.state.inputs[0];
		expect(input).toMatchObject({
			userId: "u1",
			channel: "chat",
			kind: "text",
			rawText: "haftaya perşembe 19:00 yayın",
			transcript: null,
			corrected: false,
		});
		expect(input?.createdAt.toISOString()).toBe(NOW);
	});

	it("AC1: keeps the raw input when the parser throws", async () => {
		await expect(capture("bir şey")).rejects.toThrow();

		expect(store.state.inputs).toHaveLength(1);
		expect(store.state.inputs[0]?.rawText).toBe("bir şey");
		expect(store.state.items).toHaveLength(0);
	});

	it("AC2: passes the text, the clock's now and the user's timezone to the parser", async () => {
		parser.willReturn(validEvent);
		await capture("haftaya perşembe 19:00 yayın");

		expect(parser.requests).toHaveLength(1);
		expect(parser.requests[0]?.text).toBe("haftaya perşembe 19:00 yayın");
		expect(parser.requests[0]?.now.toISOString()).toBe(NOW);
		expect(parser.requests[0]?.timezone).toBe("Europe/Istanbul");
	});

	it("AC3: creates an open event with the start time converted to UTC", async () => {
		parser.willReturn(validEvent);
		const result = expectCaptured(await capture());

		expect(store.state.items).toHaveLength(1);
		const item = store.state.items[0];
		expect(item).toMatchObject({
			ownerId: "u1",
			createdBy: "u1",
			type: "event",
			title: "Yayın izle",
			scope: "personal",
			priority: "high",
			status: "open",
			dueAt: null,
			allDay: false,
			sourceInputId: store.state.inputs[0]?.id,
		});
		// 19:00 in Istanbul (UTC+3) is 16:00 UTC.
		expect(item?.startsAt?.toISOString()).toBe("2026-11-13T16:00:00.000Z");
		expect(item?.createdAt.toISOString()).toBe(NOW);
		expect(result.item).toEqual(item);
		expect(result.timezone).toBe("Europe/Istanbul");
	});

	it("AC3: converts using the user's own timezone, including DST offsets", async () => {
		store = new InMemoryStore().addUser({
			id: "u1",
			timezone: "Europe/Berlin",
		});
		parser.willReturn({ ...validEvent, date: "2026-07-01", time: "09:30" });
		const result = expectCaptured(await capture());

		// Berlin is UTC+2 in summer.
		expect(result.item.startsAt?.toISOString()).toBe(
			"2026-07-01T07:30:00.000Z",
		);
		expect(result.timezone).toBe("Europe/Berlin");
	});

	it("AC3: trims the title", async () => {
		parser.willReturn({ ...validEvent, title: "  Yayın izle  " });
		const result = expectCaptured(await capture());

		expect(result.item.title).toBe("Yayın izle");
	});

	it("AC4: records a created event for the item at the clock's time", async () => {
		parser.willReturn(validEvent);
		const result = expectCaptured(await capture());

		expect(store.state.itemEvents).toHaveLength(1);
		const event = store.state.itemEvents[0];
		expect(event?.itemId).toBe(result.item.id);
		expect(event?.event).toBe("created");
		expect(event?.at.toISOString()).toBe(NOW);
	});

	it("AC5: schedules an event reminder 30 minutes before the start", async () => {
		parser.willReturn(validEvent);
		const result = expectCaptured(await capture());

		expect(store.state.reminders).toHaveLength(1);
		const reminder = store.state.reminders[0];
		expect(reminder?.itemId).toBe(result.item.id);
		expect(reminder?.status).toBe("pending");
		expect(reminder?.sentAt).toBeNull();
		expect(reminder?.fireAt.toISOString()).toBe("2026-11-13T15:30:00.000Z");
		expect(result.reminders.map((r) => r.fireAt.toISOString())).toEqual([
			"2026-11-13T15:30:00.000Z",
		]);
	});

	it("AC5: schedules a task reminder at 09:00 local time on the due date", async () => {
		parser.willReturn({
			type: "task",
			title: "Araç muayenesi",
			scope: "personal",
			priority: "normal",
			date: "2026-11-20",
			time: "14:00",
		});
		const result = expectCaptured(await capture());

		expect(result.item.type).toBe("task");
		expect(result.item.startsAt).toBeNull();
		expect(result.item.dueAt?.toISOString()).toBe("2026-11-20T11:00:00.000Z");
		expect(result.item.allDay).toBe(false);
		// 09:00 Istanbul = 06:00 UTC.
		expect(store.state.reminders.map((r) => r.fireAt.toISOString())).toEqual([
			"2026-11-20T06:00:00.000Z",
		]);
	});

	it("AC5: schedules a reminder-type item exactly at its time", async () => {
		parser.willReturn({
			type: "reminder",
			title: "İlacını al",
			scope: "personal",
			priority: "normal",
			date: "2026-11-07",
			time: "08:15",
		});
		const result = expectCaptured(await capture());

		expect(result.item.startsAt?.toISOString()).toBe(
			"2026-11-07T05:15:00.000Z",
		);
		expect(store.state.reminders.map((r) => r.fireAt.toISOString())).toEqual([
			"2026-11-07T05:15:00.000Z",
		]);
	});

	it("AC5: creates no reminder for a note", async () => {
		parser.willReturn({
			type: "note",
			title: "Wi-Fi şifresi kutunun altında",
			scope: "other",
			priority: "normal",
			date: null,
			time: null,
		});
		const result = expectCaptured(await capture());

		expect(result.item).toMatchObject({
			type: "note",
			startsAt: null,
			dueAt: null,
			allDay: false,
		});
		expect(store.state.reminders).toEqual([]);
		expect(jobs.scheduled).toEqual([]);
	});

	it("AC5: skips a reminder whose time has already passed", async () => {
		// Event starts in 20 minutes: "30 minutes before" is in the past.
		parser.willReturn({ ...validEvent, date: "2026-11-06", time: "12:20" });
		const result = expectCaptured(await capture());

		expect(result.item.startsAt?.toISOString()).toBe(
			"2026-11-06T09:20:00.000Z",
		);
		expect(store.state.reminders).toEqual([]);
		expect(result.reminders).toEqual([]);
	});

	it("AC5: keeps a reminder that fires exactly now", async () => {
		parser.willReturn({ ...validEvent, date: "2026-11-06", time: "12:30" });
		await capture();

		expect(store.state.reminders.map((r) => r.fireAt.toISOString())).toEqual([
			NOW,
		]);
	});

	it("AC6: schedules each reminder by id and fire time and stores the job id", async () => {
		parser.willReturn(validEvent);
		const result = expectCaptured(await capture());

		const reminder = store.state.reminders[0];
		expect(jobs.scheduled).toHaveLength(1);
		expect(jobs.scheduled[0]?.reminderId).toBe(reminder?.id);
		expect(jobs.scheduled[0]?.fireAt.toISOString()).toBe(
			"2026-11-13T15:30:00.000Z",
		);
		expect(reminder?.jobId).toBe(jobs.scheduled[0]?.jobId);
		expect(result.reminders[0]?.jobId).toBe(jobs.scheduled[0]?.jobId);
	});

	it("AC7: records the raw parse result, validity and model version on the input", async () => {
		parser.willReturn(validEvent);
		await capture();

		expect(store.state.inputs[0]).toMatchObject({
			parseResult: validEvent,
			parseValid: true,
			modelVersion: "fake-model-1",
		});
	});

	it("AC8: retries once after invalid output and uses the valid retry", async () => {
		const invalid = { ...validEvent, time: "25:99" };
		parser.willReturn(invalid, validEvent);
		const result = expectCaptured(await capture());

		expect(parser.requests).toHaveLength(2);
		expect(result.item.title).toBe("Yayın izle");
		expect(store.state.inputs[0]).toMatchObject({
			parseResult: validEvent,
			parseValid: true,
		});
	});

	it("AC9: asks again after two invalid outputs and creates nothing", async () => {
		const second = { type: "event", title: "" };
		parser.willReturn("not json at all", second);
		const result = await capture();

		expect(result).toEqual({
			kind: "needs_clarification",
			inputId: store.state.inputs[0]?.id,
		});
		expect(parser.requests).toHaveLength(2);
		expect(store.state.items).toEqual([]);
		expect(store.state.reminders).toEqual([]);
		expect(store.state.itemEvents).toEqual([]);
		expect(jobs.scheduled).toEqual([]);
		expect(store.state.inputs[0]).toMatchObject({
			parseResult: second,
			parseValid: false,
			modelVersion: "fake-model-1",
		});
	});

	it.each([
		["a non-object", "event at 7"],
		["null", null],
		["an unknown type", { ...validEvent, type: "meeting" }],
		["an unknown scope", { ...validEvent, scope: "family" }],
		["an unknown priority", { ...validEvent, priority: "urgent" }],
		["an empty title", { ...validEvent, title: "   " }],
		["a title over 200 characters", { ...validEvent, title: "a".repeat(201) }],
		["a malformed date", { ...validEvent, date: "13.11.2026" }],
		["an impossible date", { ...validEvent, date: "2026-02-30" }],
		["a malformed time", { ...validEvent, time: "7pm" }],
		["an hour out of range", { ...validEvent, time: "24:00" }],
		["minutes out of range", { ...validEvent, time: "19:60" }],
		["an event without a time", { ...validEvent, time: null }],
		["an event without a date", { ...validEvent, date: null }],
		[
			"a reminder without a time",
			{ ...validEvent, type: "reminder", time: null },
		],
		[
			"a task without a date",
			{ ...validEvent, type: "task", date: null, time: null },
		],
		["a note with a date", { ...validEvent, type: "note", time: null }],
		["a time without a date", { ...validEvent, type: "note", date: null }],
		[
			"a missing field",
			{
				type: "event",
				title: "x",
				scope: "work",
				date: "2026-11-13",
				time: "10:00",
			},
		],
	])("AC9: treats %s as invalid output", async (_label, raw) => {
		parser.willReturn(raw, raw);
		const result = await capture();

		expect(result.kind).toBe("needs_clarification");
		expect(store.state.items).toEqual([]);
	});

	it("AC10: stores a task with only a date as all-day at local midnight", async () => {
		parser.willReturn({
			type: "task",
			title: "Faturayı öde",
			scope: "personal",
			priority: "normal",
			date: "2026-11-15",
			time: null,
		});
		const result = expectCaptured(await capture());

		expect(result.item.allDay).toBe(true);
		// 00:00 Istanbul = 21:00 UTC the day before.
		expect(result.item.dueAt?.toISOString()).toBe("2026-11-14T21:00:00.000Z");
		expect(store.state.reminders.map((r) => r.fireAt.toISOString())).toEqual([
			"2026-11-15T06:00:00.000Z",
		]);
	});

	it("AC11: returns unknown_user without storing anything or calling the parser", async () => {
		parser.willReturn(validEvent);
		const run = createCaptureInput({
			clock,
			ids: new SequentialIds(),
			parser,
			uow: store,
			repos: store.repos,
			jobs,
		});
		const result = await run({ userId: "nobody", channel: "chat", text: "x" });

		expect(result).toEqual({ kind: "unknown_user" });
		expect(store.state.inputs).toEqual([]);
		expect(parser.requests).toEqual([]);
	});

	it.each(["recurring", "annual"])(
		"AC12: stores the parse but creates no item for type %s",
		async (type) => {
			const raw = { ...validEvent, type, time: null };
			parser.willReturn(raw);
			const result = await capture();

			expect(result).toEqual({
				kind: "unsupported_type",
				inputId: store.state.inputs[0]?.id,
				type,
			});
			expect(store.state.items).toEqual([]);
			expect(store.state.inputs[0]).toMatchObject({
				parseResult: raw,
				parseValid: true,
			});
		},
	);

	it("AC13: writes nothing when a reminder insert fails", async () => {
		parser.willReturn(validEvent);
		store.failNextInsertInto = "reminders";

		await expect(capture()).rejects.toThrow();

		expect(store.state.items).toEqual([]);
		expect(store.state.itemEvents).toEqual([]);
		expect(store.state.reminders).toEqual([]);
		expect(jobs.scheduled).toEqual([]);
		// The raw input survives for the eval set.
		expect(store.state.inputs).toHaveLength(1);
	});
});
