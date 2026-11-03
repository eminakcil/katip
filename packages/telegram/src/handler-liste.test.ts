// /liste command (issue #22).
//
// AC7  For a linked user, /liste (also /liste@<botname>) replies with one
//      message starting with the header "Tüm kayıtların:". Blocks below are
//      separated by a blank line:
//        - one block per day: tr-TR day header ("12 Kasım Perşembe", same as
//          /hafta), then one line per item: "• 19:00 Yayın izle" (time in the
//          user's timezone) or "• Tüm gün: Fatura öde";
//        - if there are undated items, a block starting "Tarihsiz:", then one
//          line per note: "• Wi-Fi şifresi kutunun altında".
//        The "Tarihsiz:" block is left out when there are no undated items.
// AC8  When items were left out, the reply ends with a separate block
//      "… ve {n} kayıt daha." (U+2026). With nothing left out, it does not
//      appear.
// AC9  With no open items, the reply is exactly
//      "Kayıtlı bir şey yok. Aklına geleni yazman yeterli."
// AC10 An unlinked user sending /liste gets strings.notLinked. /liste never
//      calls captureInput, and calls listAll only for linked users.
// AC11 All new copy lives in packages/telegram/src/strings.ts; replies are
//      compared with these exact strings. The command menu entry for `liste`
//      ("Tüm kayıtlar") stays as it is.
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

// Overdue event at 10:00 Istanbul on 5 Oct.
const oldMeeting = anItem({
	id: "item-old",
	type: "event",
	title: "Eski toplantı",
	startsAt: new Date("2026-10-05T07:00:00Z"),
});
// All-day task on 12 Nov (stored at 00:00 Istanbul).
const bill = anItem({
	id: "item-bill",
	type: "task",
	title: "Fatura öde",
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
const wifi = anItem({
	id: "note-wifi",
	type: "note",
	title: "Wi-Fi şifresi kutunun altında",
});
const book = anItem({ id: "note-book", type: "note", title: "Kitap önerisi" });

const EXAMPLE_REPLY = [
	"Tüm kayıtların:",
	"",
	"5 Ekim Pazartesi",
	"• 10:00 Eski toplantı",
	"",
	"12 Kasım Perşembe",
	"• Tüm gün: Fatura öde",
	"• 19:00 Yayın izle",
	"",
	"14 Kasım Cumartesi",
	"• 10:00 Araç muayenesi",
	"",
	"Tarihsiz:",
	"• Wi-Fi şifresi kutunun altında",
	"• Kitap önerisi",
].join("\n");

const EXAMPLE_RESULT = {
	kind: "listed" as const,
	timezone: "Europe/Istanbul",
	days: [
		{ day: "2026-10-05", items: [oldMeeting] },
		{ day: "2026-11-12", items: [bill, stream] },
		{ day: "2026-11-14", items: [inspection] },
	],
	undated: [wifi, book],
	more: 0,
};

let sender: RecordingSender;
let links: RecordingLinks;
let capture: ScriptedCapture;
let listToday: ScriptedListToday;
let listWeek: ScriptedListWeek;
let listAll: ScriptedListAll;
let handle: (update: unknown) => Promise<void>;

beforeEach(() => {
	sender = new RecordingSender();
	links = new RecordingLinks();
	capture = new ScriptedCapture();
	listToday = new ScriptedListToday();
	listWeek = new ScriptedListWeek();
	listAll = new ScriptedListAll();
	handle = createUpdateHandler({
		sender,
		processedUpdates: new InMemoryProcessedUpdates(),
		identities: new MapIdentities({ 42: "u1" }),
		messageLinks: links,
		captureInput: capture.run,
		listToday: listToday.run,
		listWeek: listWeek.run,
		listAll: listAll.run,
		clock: { now: () => now },
		webAppUrl: WEB,
	});
});

function sentMessages() {
	return sender.messages.map((m) => m.message);
}

describe("/liste", () => {
	it("AC7: lists days (past included) then undated notes, as one Turkish message without buttons", async () => {
		listAll.result = EXAMPLE_RESULT;

		await handle(textUpdate(1, "/liste"));

		expect(listAll.commands).toEqual([{ userId: "u1" }]);
		expect(listToday.commands).toEqual([]);
		expect(listWeek.commands).toEqual([]);
		expect(sender.messages).toHaveLength(1);
		expect(sender.messages[0]?.chatId).toBe(42);
		expect(sentMessages()).toEqual([{ text: EXAMPLE_REPLY }]);
	});

	it("AC7: /liste@<botname> behaves the same as /liste", async () => {
		listAll.result = EXAMPLE_RESULT;

		await handle(textUpdate(2, "/liste@katip_bot"));

		expect(listAll.commands).toEqual([{ userId: "u1" }]);
		expect(sentMessages()).toEqual([{ text: EXAMPLE_REPLY }]);
	});

	it("AC7: leaves out the Tarihsiz block when there are no undated items", async () => {
		listAll.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [{ day: "2026-11-12", items: [bill, stream] }],
			undated: [],
			more: 0,
		};

		await handle(textUpdate(3, "/liste"));

		expect(sentMessages()).toEqual([
			{
				text: [
					"Tüm kayıtların:",
					"",
					"12 Kasım Perşembe",
					"• Tüm gün: Fatura öde",
					"• 19:00 Yayın izle",
				].join("\n"),
			},
		]);
	});

	it("AC7: with only undated items, shows the header and the Tarihsiz block", async () => {
		listAll.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [],
			undated: [book, wifi],
			more: 0,
		};

		await handle(textUpdate(4, "/liste"));

		expect(sentMessages()).toEqual([
			{
				text: [
					"Tüm kayıtların:",
					"",
					"Tarihsiz:",
					"• Kitap önerisi",
					"• Wi-Fi şifresi kutunun altında",
				].join("\n"),
			},
		]);
	});

	it("AC7: shows times in the result's timezone and day headers from the day keys, in the given order", async () => {
		listAll.result = {
			kind: "listed",
			timezone: "America/New_York",
			days: [
				{
					day: "2026-11-01",
					items: [
						anItem({
							id: "ny-allday",
							type: "event",
							title: "Doğum günü",
							startsAt: new Date("2026-11-01T04:00:00Z"), // 00:00 EDT
							allDay: true,
						}),
						anItem({
							id: "ny-event",
							type: "event",
							title: "Akşam yemeği",
							startsAt: new Date("2026-11-02T00:30:00Z"), // 19:30 EST, 1 Nov
						}),
					],
				},
				{
					day: "2026-11-12",
					items: [
						anItem({
							id: "ny-task",
							type: "task",
							title: "Rapor gönder",
							dueAt: new Date("2026-11-12T14:15:00Z"), // 09:15 EST
						}),
					],
				},
			],
			undated: [],
			more: 0,
		};

		await handle(textUpdate(5, "/liste"));

		expect(sentMessages()).toEqual([
			{
				text: [
					"Tüm kayıtların:",
					"",
					"1 Kasım Pazar",
					"• Tüm gün: Doğum günü",
					"• 19:30 Akşam yemeği",
					"",
					"12 Kasım Perşembe",
					"• 09:15 Rapor gönder",
				].join("\n"),
			},
		]);
	});

	it("AC8: when items were left out, ends with a separate '… ve {n} kayıt daha.' block", async () => {
		listAll.result = { ...EXAMPLE_RESULT, more: 3 };

		await handle(textUpdate(6, "/liste"));

		expect(sentMessages()).toEqual([
			{ text: `${EXAMPLE_REPLY}\n\n… ve 3 kayıt daha.` },
		]);
	});

	it("AC8: the overflow block also follows the last day when there are no undated items", async () => {
		listAll.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [{ day: "2026-11-14", items: [inspection] }],
			undated: [],
			more: 12,
		};

		await handle(textUpdate(7, "/liste"));

		expect(sentMessages()).toEqual([
			{
				text: [
					"Tüm kayıtların:",
					"",
					"14 Kasım Cumartesi",
					"• 10:00 Araç muayenesi",
					"",
					"… ve 12 kayıt daha.",
				].join("\n"),
			},
		]);
	});

	it("AC8: with nothing left out, there is no overflow line", async () => {
		listAll.result = EXAMPLE_RESULT;

		await handle(textUpdate(8, "/liste"));

		const text = sentMessages()[0]?.text ?? "";
		expect(text).toBe(EXAMPLE_REPLY);
		expect(text).not.toContain("kayıt daha");
		expect(text).not.toContain("…");
	});

	it("AC9: with no open items, replies exactly with the empty text", async () => {
		listAll.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [],
			undated: [],
			more: 0,
		};

		await handle(textUpdate(9, "/liste"));

		expect(sentMessages()).toEqual([
			{ text: "Kayıtlı bir şey yok. Aklına geleni yazman yeterli." },
		]);
	});

	it("AC10: an unlinked user gets the linking prompt; listAll only runs for linked users; captureInput never", async () => {
		listAll.result = {
			kind: "listed",
			timezone: "Europe/Istanbul",
			days: [{ day: "2026-11-12", items: [bill] }],
			undated: [],
			more: 0,
		};

		await handle(textUpdate(10, "/liste", { fromId: 7 })); // unlinked
		await handle(textUpdate(11, "/liste")); // linked as u1

		expect(listAll.commands).toEqual([{ userId: "u1" }]);
		expect(capture.commands).toEqual([]);
		expect(links.saved).toEqual([]);
		expect(sender.messages).toEqual([
			{ chatId: 7, message: { text: strings.notLinked(WEB) }, messageId: 500 },
			{
				chatId: 42,
				message: {
					text: [
						"Tüm kayıtların:",
						"",
						"12 Kasım Perşembe",
						"• Tüm gün: Fatura öde",
					].join("\n"),
				},
				messageId: 501,
			},
		]);
	});

	it("AC10: if ListAll reports an unknown user, the reply is the linking prompt", async () => {
		listAll.result = { kind: "unknown_user" };

		await handle(textUpdate(12, "/liste"));

		expect(listAll.commands).toEqual([{ userId: "u1" }]);
		expect(capture.commands).toEqual([]);
		expect(sentMessages()).toEqual([{ text: strings.notLinked(WEB) }]);
	});

	it("AC11: the new Turkish texts appear in strings.ts and in no other source file; the menu entry is unchanged", () => {
		expect(strings.commands).toContainEqual({
			command: "liste",
			description: "Tüm kayıtlar",
		});

		const dir = fileURLToPath(new URL(".", import.meta.url));
		const others = readdirSync(dir).filter(
			(f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "strings.ts",
		);
		const stringsSource = readFileSync(join(dir, "strings.ts"), "utf8");

		for (const copy of [
			"Tüm kayıtların:",
			"Tarihsiz:",
			"kayıt daha.",
			"Kayıtlı bir şey yok. Aklına geleni yazman yeterli.",
		]) {
			expect(stringsSource).toContain(copy);
		}
		for (const file of others) {
			const source = readFileSync(join(dir, file), "utf8");
			for (const copy of ["Tüm kayıtların", "Tarihsiz", "kayıt daha"]) {
				expect(source, `${file} has inline Turkish copy`).not.toContain(copy);
			}
		}
	});
});
