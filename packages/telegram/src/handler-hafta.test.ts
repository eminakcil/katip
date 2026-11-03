// /hafta command (issue #9).
//
// AC7  /hafta from a linked user replies with this format (dates in tr-TR, same
//      bullet lines as /bugun), one message without buttons:
//        Önümüzdeki 7 gün:
//
//        12 Kasım Perşembe
//        • Tüm gün: Faturayı öde
//        • 19:00 Yayın izle
//
//        14 Kasım Cumartesi
//        • 10:00 Araç muayenesi
//      Days and items keep the order ListWeek returns; times are shown in the
//      result's timezone.
// AC8  With no items in the next 7 days, the reply is exactly:
//      "Önümüzdeki 7 gün için kayıtlı bir şey yok. Aklına geleni yazman yeterli."
// AC9  /hafta from an unlinked user gets the linking prompt, and /hafta is
//      never passed to CaptureInput.
// AC10 All new user-facing Turkish text lives in packages/telegram/src/strings.ts,
//      and the `hafta` entry in the command menu reads "Önümüzdeki 7 gün".
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
// 12 Nov 2026, 09:00 in Istanbul.
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

// All-day task on 12 Nov (stored at 00:00 Istanbul).
const bill = anItem({
	id: "item-bill",
	type: "task",
	title: "Faturayı öde",
	dueAt: new Date("2026-11-11T21:00:00Z"),
	allDay: true,
});
// Event at 19:00 Istanbul on 12 Nov.
const stream = anItem({
	id: "item-stream",
	type: "event",
	title: "Yayın izle",
	startsAt: new Date("2026-11-12T16:00:00Z"),
});
// Timed task at 10:00 Istanbul on 14 Nov.
const inspection = anItem({
	id: "item-inspection",
	type: "task",
	title: "Araç muayenesi",
	dueAt: new Date("2026-11-14T07:00:00Z"),
});

const EXAMPLE_REPLY = [
	"Önümüzdeki 7 gün:",
	"",
	"12 Kasım Perşembe",
	"• Tüm gün: Faturayı öde",
	"• 19:00 Yayın izle",
	"",
	"14 Kasım Cumartesi",
	"• 10:00 Araç muayenesi",
].join("\n");

let sender: RecordingSender;
let links: RecordingLinks;
let capture: ScriptedCapture;
let listToday: ScriptedListToday;
let listWeek: ScriptedListWeek;
let handle: (update: unknown) => Promise<void>;

beforeEach(() => {
	sender = new RecordingSender();
	links = new RecordingLinks();
	capture = new ScriptedCapture();
	listToday = new ScriptedListToday();
	listWeek = new ScriptedListWeek();
	handle = createUpdateHandler({
		sender,
		processedUpdates: new InMemoryProcessedUpdates(),
		identities: new MapIdentities({ 42: "u1" }),
		messageLinks: links,
		captureInput: capture.run,
		listToday: listToday.run,
		listWeek: listWeek.run,
		listAll: new ScriptedListAll().run,
		clock: { now: () => now },
		webAppUrl: WEB,
	});
});

function sentMessages() {
	return sender.messages.map((m) => m.message);
}

describe("/hafta", () => {
	it("AC7: lists the next 7 days grouped by day, as one Turkish message without buttons", async () => {
		listWeek.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [
				{ day: "2026-11-12", items: [bill, stream] },
				{ day: "2026-11-14", items: [inspection] },
			],
		};

		await handle(textUpdate(1, "/hafta"));

		expect(listWeek.commands).toEqual([{ userId: "u1" }]);
		expect(listToday.commands).toEqual([]);
		expect(sender.messages).toHaveLength(1);
		expect(sender.messages[0]?.chatId).toBe(42);
		expect(sentMessages()).toEqual([{ text: EXAMPLE_REPLY }]);
	});

	it("AC7: keeps the day and item order ListWeek returns", async () => {
		listWeek.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [
				{ day: "2026-11-12", items: [stream, bill] },
				{ day: "2026-11-18", items: [inspection] },
			],
		};

		await handle(textUpdate(2, "/hafta"));

		expect(sentMessages()).toEqual([
			{
				text: [
					"Önümüzdeki 7 gün:",
					"",
					"12 Kasım Perşembe",
					"• 19:00 Yayın izle",
					"• Tüm gün: Faturayı öde",
					"",
					"18 Kasım Çarşamba",
					"• 10:00 Araç muayenesi",
				].join("\n"),
			},
		]);
	});

	it("AC7: shows times in the result's timezone and the day header from the day key", async () => {
		listWeek.result = {
			kind: "listed",
			timezone: "America/New_York",
			days: [
				{
					// 19:30 on 12 Nov in New York is already 13 Nov in UTC.
					day: "2026-11-12",
					items: [
						anItem({
							id: "ny-task",
							type: "task",
							title: "Rapor gönder",
							dueAt: new Date("2026-11-12T14:15:00Z"), // 09:15 New York
						}),
						anItem({
							id: "ny-event",
							type: "event",
							title: "Akşam yemeği",
							startsAt: new Date("2026-11-13T00:30:00Z"), // 19:30 New York
						}),
					],
				},
				{
					day: "2026-11-15",
					items: [
						anItem({
							id: "ny-allday",
							type: "event",
							title: "Doğum günü",
							startsAt: new Date("2026-11-15T05:00:00Z"), // 00:00 New York
							allDay: true,
						}),
					],
				},
			],
		};

		await handle(textUpdate(3, "/hafta"));

		expect(sentMessages()).toEqual([
			{
				text: [
					"Önümüzdeki 7 gün:",
					"",
					"12 Kasım Perşembe",
					"• 09:15 Rapor gönder",
					"• 19:30 Akşam yemeği",
					"",
					"15 Kasım Pazar",
					"• Tüm gün: Doğum günü",
				].join("\n"),
			},
		]);
	});

	it("AC7: /hafta@<botusername> behaves the same as /hafta", async () => {
		listWeek.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [
				{ day: "2026-11-12", items: [bill, stream] },
				{ day: "2026-11-14", items: [inspection] },
			],
		};

		await handle(textUpdate(4, "/hafta@katip_bot"));

		expect(listWeek.commands).toEqual([{ userId: "u1" }]);
		expect(sentMessages()).toEqual([{ text: EXAMPLE_REPLY }]);
	});

	it("AC8: with no items in the next 7 days, replies with the empty-week text", async () => {
		listWeek.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [],
		};

		await handle(textUpdate(5, "/hafta"));

		expect(sentMessages()).toEqual([
			{
				text: "Önümüzdeki 7 gün için kayıtlı bir şey yok. Aklına geleni yazman yeterli.",
			},
		]);
	});

	it("AC9: an unlinked user gets the linking prompt; /hafta never reaches CaptureInput", async () => {
		listWeek.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [{ day: "2026-11-12", items: [bill] }],
		};

		await handle(textUpdate(6, "/hafta", { fromId: 7 })); // unlinked
		await handle(textUpdate(7, "/hafta")); // linked as u1

		// Only the linked user reaches ListWeek; nobody reaches CaptureInput.
		expect(listWeek.commands).toEqual([{ userId: "u1" }]);
		expect(capture.commands).toEqual([]);
		expect(links.saved).toEqual([]);
		expect(sender.messages).toEqual([
			{ chatId: 7, message: { text: strings.notLinked(WEB) }, messageId: 500 },
			{
				chatId: 42,
				message: {
					text: [
						"Önümüzdeki 7 gün:",
						"",
						"12 Kasım Perşembe",
						"• Tüm gün: Faturayı öde",
					].join("\n"),
				},
				messageId: 501,
			},
		]);
	});

	it("AC9: if ListWeek reports an unknown user, the reply is the linking prompt", async () => {
		listWeek.result = { kind: "unknown_user" };

		await handle(textUpdate(8, "/hafta"));

		expect(capture.commands).toEqual([]);
		expect(sentMessages()).toEqual([{ text: strings.notLinked(WEB) }]);
	});

	it("AC10: the hafta entry in the command menu reads 'Önümüzdeki 7 gün'", () => {
		expect(strings.commands).toContainEqual({
			command: "hafta",
			description: "Önümüzdeki 7 gün",
		});
	});

	it("AC10: the new Turkish texts appear in strings.ts and in no other source file", () => {
		const dir = fileURLToPath(new URL(".", import.meta.url));
		const others = readdirSync(dir).filter(
			(f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "strings.ts",
		);
		const stringsSource = readFileSync(join(dir, "strings.ts"), "utf8");

		expect(stringsSource).toContain("Önümüzdeki 7 gün");
		expect(stringsSource).toContain(
			"için kayıtlı bir şey yok. Aklına geleni yazman yeterli.",
		);
		for (const file of others) {
			const source = readFileSync(join(dir, file), "utf8");
			expect(source, `${file} has inline Turkish copy`).not.toContain(
				"Önümüzdeki",
			);
		}
	});
});
