// /bugun command (issue #6).
//
// AC4 A linked user sends /bugun on 12 November and has an all-day task
//     "Araba muayenesi" and an event "Yayın izle" at 19:00 local. The bot
//     replies with exactly this text (no buttons):
//       Bugün, 12 Kasım Perşembe:
//       • Tüm gün: Araba muayenesi
//       • 19:00 Yayın izle
//     The order is the order ListToday returns. Times are shown in the user's
//     timezone.
// AC5 With no items, the reply is exactly:
//     "Bugün için kayıtlı bir şey yok. Aklına geleni yazman yeterli."
// AC6 /bugun@<botusername> behaves the same as /bugun.
// AC7 /bugun never calls captureInput and never saves a message link. An
//     unlinked user sending /bugun gets the existing "not linked" message.
//     Commands not implemented yet (e.g. /baglan) still reply with the
//     existing "coming soon" text. (/hafta was implemented in issue #9, see
//     handler-hafta.test.ts; /liste in issue #22, see handler-liste.test.ts.)
import type { Item } from "@katip/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
	InMemoryProcessedUpdates,
	MapIdentities,
	RecordingLinks,
	RecordingSender,
	ScriptedCapture,
	ScriptedListAll,
	ScriptedListToday,
	ScriptedListWeek,
	textUpdate,
} from "../test/fakes";
import { createUpdateHandler } from "./handler";
import { strings } from "./strings";

const WEB = "https://katip.example";
// 12 Nov 2026, 09:00 in Istanbul and 04:00 in New York.
const now = new Date("2026-11-12T06:00:00Z");

function anItem(overrides: Partial<Item>): Item {
	return {
		id: "item",
		ownerId: "u1",
		createdBy: "u1",
		type: "event",
		title: "Item",
		scope: "personal",
		priority: "normal",
		status: "open",
		startsAt: null,
		dueAt: null,
		allDay: false,
		sourceInputId: null,
		createdAt: new Date("2026-11-01T09:00:00Z"),
		...overrides,
	};
}

// All-day task: stored at 00:00 local (12 Nov, Istanbul).
const carInspection = anItem({
	id: "item-car",
	type: "task",
	title: "Araba muayenesi",
	dueAt: new Date("2026-11-11T21:00:00Z"),
	allDay: true,
});
// Event at 19:00 Istanbul.
const stream = anItem({
	id: "item-stream",
	type: "event",
	title: "Yayın izle",
	startsAt: new Date("2026-11-12T16:00:00Z"),
});

let sender: RecordingSender;
let links: RecordingLinks;
let capture: ScriptedCapture;
let listToday: ScriptedListToday;
let handle: (update: unknown) => Promise<void>;

beforeEach(() => {
	sender = new RecordingSender();
	links = new RecordingLinks();
	capture = new ScriptedCapture();
	listToday = new ScriptedListToday();
	handle = createUpdateHandler({
		sender,
		processedUpdates: new InMemoryProcessedUpdates(),
		identities: new MapIdentities({ 42: "u1" }),
		messageLinks: links,
		captureInput: capture.run,
		listToday: listToday.run,
		listWeek: new ScriptedListWeek().run,
		listAll: new ScriptedListAll().run,
		clock: { now: () => now },
		webAppUrl: WEB,
	});
});

function sentMessages() {
	return sender.messages.map((m) => m.message);
}

describe("/bugun", () => {
	it("AC4: lists today's items as one Turkish message without buttons", async () => {
		listToday.result = {
			kind: "listed",
			day: "2026-11-12",
			timezone: "Europe/Istanbul",
			items: [carInspection, stream],
		};

		await handle(textUpdate(1, "/bugun"));

		expect(listToday.commands).toEqual([{ userId: "u1" }]);
		expect(sender.messages).toHaveLength(1);
		expect(sender.messages[0]?.chatId).toBe(42);
		expect(sentMessages()).toEqual([
			{
				text: [
					"Bugün, 12 Kasım Perşembe:",
					"• Tüm gün: Araba muayenesi",
					"• 19:00 Yayın izle",
				].join("\n"),
			},
		]);
	});

	it("AC4: keeps the order ListToday returns", async () => {
		listToday.result = {
			kind: "listed",
			day: "2026-11-12",
			timezone: "Europe/Istanbul",
			items: [stream, carInspection],
		};

		await handle(textUpdate(2, "/bugun"));

		expect(sentMessages()).toEqual([
			{
				text: [
					"Bugün, 12 Kasım Perşembe:",
					"• 19:00 Yayın izle",
					"• Tüm gün: Araba muayenesi",
				].join("\n"),
			},
		]);
	});

	it("AC4: shows times in the user's timezone, including a timed task's due time", async () => {
		listToday.result = {
			kind: "listed",
			day: "2026-11-12",
			timezone: "America/New_York",
			items: [
				anItem({
					id: "ny-task",
					ownerId: "u1",
					type: "task",
					title: "Rapor gönder",
					dueAt: new Date("2026-11-12T14:15:00Z"), // 09:15 New York
				}),
				anItem({
					id: "ny-event",
					ownerId: "u1",
					type: "event",
					title: "Akşam yemeği",
					startsAt: new Date("2026-11-13T00:30:00Z"), // 19:30 New York, 12 Nov
				}),
			],
		};

		await handle(textUpdate(3, "/bugun"));

		expect(sentMessages()).toEqual([
			{
				text: [
					"Bugün, 12 Kasım Perşembe:",
					"• 09:15 Rapor gönder",
					"• 19:30 Akşam yemeği",
				].join("\n"),
			},
		]);
	});

	it("AC5: with no items, replies with the empty-day text", async () => {
		listToday.result = {
			kind: "listed",
			day: "2026-11-12",
			timezone: "Europe/Istanbul",
			items: [],
		};

		await handle(textUpdate(4, "/bugun"));

		expect(sentMessages()).toEqual([
			{
				text: "Bugün için kayıtlı bir şey yok. Aklına geleni yazman yeterli.",
			},
		]);
	});

	it("AC6: /bugun@<botusername> behaves the same as /bugun", async () => {
		listToday.result = {
			kind: "listed",
			day: "2026-11-12",
			timezone: "Europe/Istanbul",
			items: [carInspection, stream],
		};

		await handle(textUpdate(5, "/bugun@katip_bot"));

		expect(listToday.commands).toEqual([{ userId: "u1" }]);
		expect(sentMessages()).toEqual([
			{
				text: [
					"Bugün, 12 Kasım Perşembe:",
					"• Tüm gün: Araba muayenesi",
					"• 19:00 Yayın izle",
				].join("\n"),
			},
		]);
	});

	it("AC7: never calls captureInput and never saves a message link", async () => {
		listToday.result = {
			kind: "listed",
			day: "2026-11-12",
			timezone: "Europe/Istanbul",
			items: [carInspection, stream],
		};

		await handle(textUpdate(6, "/bugun"));

		expect(listToday.commands).toEqual([{ userId: "u1" }]);
		expect(capture.commands).toEqual([]);
		expect(links.saved).toEqual([]);
	});

	it("AC7: an unlinked user sending /bugun gets the not-linked message", async () => {
		await handle(textUpdate(7, "/bugun", { fromId: 7 }));

		expect(listToday.commands).toEqual([]);
		expect(capture.commands).toEqual([]);
		expect(sender.messages).toEqual([
			{ chatId: 7, message: { text: strings.notLinked(WEB) }, messageId: 500 },
		]);
	});

	it.each(["/baglan"])(
		"AC7: %s still replies with the coming-soon text",
		async (command) => {
			await handle(textUpdate(8, command));

			expect(listToday.commands).toEqual([]);
			expect(capture.commands).toEqual([]);
			expect(sentMessages()).toEqual([{ text: "Bu komut yakında geliyor." }]);
		},
	);
});
