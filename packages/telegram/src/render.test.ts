// Rendering core results as Turkish Telegram messages.
//
// AC-R1 A captured dated item is confirmed with its full Turkish date (and time
//       unless all-day), the morning-list note for future days, the reminder
//       time, and a reply hint.
// AC-R2 Every confirmation has the Düzenle / Saati değiştir / Sil buttons.
// AC-R3 Other results map to their Turkish messages.
import type { Item, Reminder } from "@katip/core";
import { describe, expect, it } from "vitest";

import { renderCaptureResult } from "./render";
import { strings } from "./strings";

// Friday 6 Nov 2026, 12:00 in Istanbul.
const now = new Date("2026-11-06T09:00:00Z");
const ctx = { now, webAppUrl: "https://katip.example" };
const TZ = "Europe/Istanbul";

function item(overrides: Partial<Item>): Item {
	return {
		id: "item-1",
		ownerId: "u1",
		createdBy: "u1",
		type: "event",
		title: "Yayın izle",
		scope: "personal",
		priority: "high",
		status: "open",
		startsAt: null,
		dueAt: null,
		allDay: false,
		sourceInputId: "input-1",
		createdAt: now,
		...overrides,
	};
}

function reminder(fireAt: string): Reminder {
	return {
		id: "r1",
		itemId: "item-1",
		fireAt: new Date(fireAt),
		status: "pending",
		sentAt: null,
		jobId: "job-1",
	};
}

function captured(i: Item, reminders: Reminder[] = []) {
	return renderCaptureResult(
		{ kind: "captured", item: i, reminders, timezone: TZ },
		ctx,
	);
}

describe("renderCaptureResult: captured", () => {
	it("AC-R1: confirms next Thursday's event like the brief", () => {
		const message = captured(
			item({ startsAt: new Date("2026-11-12T16:00:00Z") }),
			[reminder("2026-11-12T15:30:00Z")],
		);

		expect(message.text).toBe(
			"Not aldım. Yayın izle, 12 Kasım Perşembe 19:00. O gün sabah listede ve 18:30'da hatırlatacağım. Detay eklemek için bu mesajı yanıtla.",
		);
	});

	it("AC-R1: omits the morning list for an item later today", () => {
		const message = captured(
			item({ title: "Toplantı", startsAt: new Date("2026-11-06T12:00:00Z") }),
			[reminder("2026-11-06T11:30:00Z")],
		);

		expect(message.text).toBe(
			"Not aldım. Toplantı, 6 Kasım Cuma 15:00. 14:30'da hatırlatacağım. Detay eklemek için bu mesajı yanıtla.",
		);
	});

	it("AC-R1: says nothing about reminders when none were scheduled", () => {
		const message = captured(
			item({ title: "Toplantı", startsAt: new Date("2026-11-06T09:20:00Z") }),
		);

		expect(message.text).toBe(
			"Not aldım. Toplantı, 6 Kasım Cuma 12:20. Detay eklemek için bu mesajı yanıtla.",
		);
	});

	it("AC-R1: mentions only the morning list for a future item without reminders", () => {
		const message = captured(
			item({ startsAt: new Date("2026-11-12T16:00:00Z") }),
		);

		expect(message.text).toBe(
			"Not aldım. Yayın izle, 12 Kasım Perşembe 19:00. O gün sabah listede olacak. Detay eklemek için bu mesajı yanıtla.",
		);
	});

	it("AC-R1: shows an all-day task with its date only", () => {
		const message = captured(
			item({
				type: "task",
				title: "Faturayı öde",
				dueAt: new Date("2026-11-14T21:00:00Z"),
				allDay: true,
			}),
			[reminder("2026-11-15T06:00:00Z")],
		);

		expect(message.text).toBe(
			"Not aldım. Faturayı öde, 15 Kasım Pazar. O gün sabah listede ve 09:00'da hatırlatacağım. Detay eklemek için bu mesajı yanıtla.",
		);
	});

	it("AC-R1: spells out the reminder's date when it falls on another day", () => {
		const message = captured(
			item({
				title: "Gece yayını",
				startsAt: new Date("2026-11-12T21:15:00Z"),
			}),
			[reminder("2026-11-12T20:45:00Z")],
		);

		expect(message.text).toBe(
			"Not aldım. Gece yayını, 13 Kasım Cuma 00:15. O gün sabah listede ve 12 Kasım Perşembe 23:45'te hatırlatacağım. Detay eklemek için bu mesajı yanıtla.",
		);
	});

	it("AC-R1: confirms a note without any date", () => {
		const message = captured(
			item({ type: "note", title: "Wi-Fi şifresi kutunun altında" }),
		);

		expect(message.text).toBe(
			"Not aldım: Wi-Fi şifresi kutunun altında. Detay eklemek için bu mesajı yanıtla.",
		);
	});

	it("AC-R2: attaches the three item buttons with the item id", () => {
		const message = captured(
			item({ id: "abc-123", startsAt: new Date("2026-11-12T16:00:00Z") }),
		);

		expect(message.buttons).toEqual([
			[
				{ text: "Düzenle", callbackData: "edit:abc-123" },
				{ text: "Saati değiştir", callbackData: "time:abc-123" },
				{ text: "Sil", callbackData: "del:abc-123" },
			],
		]);
	});
});

describe("renderCaptureResult: other results", () => {
	it("AC-R3: asks the user to rephrase", () => {
		expect(
			renderCaptureResult({ kind: "needs_clarification", inputId: "i" }, ctx),
		).toEqual({ text: strings.needsClarification });
	});

	it("AC-R3: reports the parser as temporarily unavailable", () => {
		expect(
			renderCaptureResult({ kind: "parser_unavailable", inputId: "i" }, ctx),
		).toEqual({ text: strings.parserUnavailable });
	});

	it("AC-R3: explains unsupported item types", () => {
		expect(
			renderCaptureResult(
				{ kind: "unsupported_type", inputId: "i", type: "annual" },
				ctx,
			),
		).toEqual({ text: strings.unsupportedType });
	});

	it("AC-R3: sends unknown users the linking prompt", () => {
		expect(renderCaptureResult({ kind: "unknown_user" }, ctx)).toEqual({
			text: strings.notLinked("https://katip.example"),
		});
	});

	it("AC-R3: all fixed messages are non-empty Turkish copy", () => {
		for (const text of [
			strings.needsClarification,
			strings.parserUnavailable,
			strings.unsupportedType,
			strings.welcome,
			strings.commandComingSoon,
			strings.onlyText,
			strings.buttonComingSoon,
		]) {
			expect(text.trim().length).toBeGreaterThan(10);
		}
		expect(strings.notLinked("https://katip.example")).toContain(
			"https://katip.example",
		);
	});
});
