// Telegram update handling.
//
// AC-H1  An update_id is processed at most once.
// AC-H2  Unlinked users get the linking prompt; nothing is captured.
// AC-H3  Text from a linked user goes to CaptureInput with the internal user id
//        and the "telegram" channel.
// AC-H4  A captured item is confirmed in the same chat with buttons, and the
//        bot message is linked to the item for reply-to-add-detail.
// AC-H5  Non-captured results are answered without a message link.
// AC-H6  If handling fails, the update is released so Telegram's retry is
//        processed, and the error propagates (webhook answers 500).
// AC-H7  Commands are never captured: /start greets or prompts linking, other
//        commands are "coming soon".
// AC-H8  Non-text messages get the "text only for now" reply.
// AC-H9  Button presses are acknowledged as "coming soon".
// AC-H10 Group chats and unrelated update types are ignored.
import type { CaptureInputResult, Item } from "@katip/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
	InMemoryProcessedUpdates,
	MapIdentities,
	RecordingLinks,
	RecordingSender,
	ScriptedCapture,
	textUpdate,
} from "../test/fakes";
import { createUpdateHandler } from "./handler";
import { strings } from "./strings";

const WEB = "https://katip.example";
const now = new Date("2026-11-06T09:00:00Z");

const capturedItem: Item = {
	id: "item-1",
	ownerId: "u1",
	createdBy: "u1",
	type: "event",
	title: "Yayın izle",
	scope: "personal",
	priority: "high",
	status: "open",
	startsAt: new Date("2026-11-12T16:00:00Z"),
	dueAt: null,
	allDay: false,
	sourceInputId: "input-1",
	createdAt: now,
};
const capturedResult: CaptureInputResult = {
	kind: "captured",
	item: capturedItem,
	reminders: [],
	timezone: "Europe/Istanbul",
};

let sender: RecordingSender;
let processed: InMemoryProcessedUpdates;
let links: RecordingLinks;
let capture: ScriptedCapture;
let handle: (update: unknown) => Promise<void>;

beforeEach(() => {
	sender = new RecordingSender();
	processed = new InMemoryProcessedUpdates();
	links = new RecordingLinks();
	capture = new ScriptedCapture();
	handle = createUpdateHandler({
		sender,
		processedUpdates: processed,
		identities: new MapIdentities({ 42: "u1" }),
		messageLinks: links,
		captureInput: capture.run,
		clock: { now: () => now },
		webAppUrl: WEB,
	});
});

describe("update handler", () => {
	it("AC-H1: processes a duplicate update_id only once", async () => {
		capture.result = capturedResult;
		await handle(textUpdate(1, "yarın 10'da toplantı"));
		await handle(textUpdate(1, "yarın 10'da toplantı"));

		expect(capture.commands).toHaveLength(1);
		expect(sender.messages).toHaveLength(1);
	});

	it("AC-H2: sends unlinked users the linking prompt and captures nothing", async () => {
		await handle(textUpdate(2, "yarın toplantı", { fromId: 7 }));

		expect(capture.commands).toEqual([]);
		expect(sender.messages).toEqual([
			{ chatId: 7, message: { text: strings.notLinked(WEB) }, messageId: 500 },
		]);
	});

	it("AC-H3: captures a linked user's text with the internal user id", async () => {
		capture.result = capturedResult;
		await handle(textUpdate(3, "haftaya perşembe 19:00 yayın"));

		expect(capture.commands).toEqual([
			{
				userId: "u1",
				channel: "telegram",
				text: "haftaya perşembe 19:00 yayın",
			},
		]);
	});

	it("AC-H4: confirms in the same chat with buttons and links the message to the item", async () => {
		capture.result = capturedResult;
		await handle(textUpdate(4, "haftaya perşembe 19:00 yayın"));

		expect(sender.messages).toHaveLength(1);
		const sent = sender.messages[0];
		expect(sent?.chatId).toBe(42);
		expect(sent?.message.text).toContain("12 Kasım Perşembe 19:00");
		expect(sent?.message.buttons?.[0]?.map((b) => b.callbackData)).toEqual([
			"edit:item-1",
			"time:item-1",
			"del:item-1",
		]);
		expect(links.saved).toEqual([
			{ chatId: 42, messageId: 500, itemId: "item-1" },
		]);
	});

	it("AC-H5: answers non-captured results without a message link", async () => {
		capture.result = { kind: "needs_clarification", inputId: "input-1" };
		await handle(textUpdate(5, "şey"));

		expect(sender.messages.map((m) => m.message)).toEqual([
			{ text: strings.needsClarification },
		]);
		expect(links.saved).toEqual([]);
	});

	it("AC-H6: releases the update and rethrows when handling fails", async () => {
		capture.result = new Error("db down");

		await expect(handle(textUpdate(6, "yarın toplantı"))).rejects.toThrow(
			"db down",
		);
		expect(processed.claimed.has(6)).toBe(false);

		// Telegram retries the same update; it is processed this time.
		capture.result = capturedResult;
		await handle(textUpdate(6, "yarın toplantı"));
		expect(sender.messages).toHaveLength(1);
	});

	it("AC-H7: greets a linked user on /start without capturing", async () => {
		await handle(textUpdate(7, "/start"));

		expect(capture.commands).toEqual([]);
		expect(sender.messages.map((m) => m.message)).toEqual([
			{ text: strings.welcome },
		]);
	});

	it("AC-H7: prompts an unlinked user to link on /start", async () => {
		await handle(textUpdate(8, "/start abc", { fromId: 7 }));

		expect(sender.messages.map((m) => m.message)).toEqual([
			{ text: strings.notLinked(WEB) },
		]);
	});

	it.each(["/bugun", "/hafta", "/liste", "/baglan", "/bilinmeyen"])(
		"AC-H7: answers %s as coming soon",
		async (command) => {
			await handle(textUpdate(9, command));

			expect(capture.commands).toEqual([]);
			expect(sender.messages.map((m) => m.message)).toEqual([
				{ text: strings.commandComingSoon },
			]);
		},
	);

	it("AC-H8: tells a linked user that only text is understood for now", async () => {
		await handle({
			update_id: 10,
			message: {
				message_id: 11,
				date: 1_700_000_000,
				chat: { id: 42, type: "private" },
				from: { id: 42, is_bot: false, first_name: "Emin" },
				voice: { file_id: "f", file_unique_id: "u", duration: 3 },
			},
		});

		expect(capture.commands).toEqual([]);
		expect(sender.messages.map((m) => m.message)).toEqual([
			{ text: strings.onlyText },
		]);
	});

	it("AC-H9: acknowledges button presses as coming soon", async () => {
		await handle({
			update_id: 11,
			callback_query: {
				id: "cb-1",
				from: { id: 42, is_bot: false, first_name: "Emin" },
				chat_instance: "x",
				data: "time:item-1",
			},
		});

		expect(sender.callbackAnswers).toEqual([
			{ id: "cb-1", text: strings.buttonComingSoon },
		]);
		expect(sender.messages).toEqual([]);
	});

	it("AC-H10: ignores messages in group chats", async () => {
		await handle(
			textUpdate(12, "merhaba", { chatId: -100, chatType: "group" }),
		);

		expect(capture.commands).toEqual([]);
		expect(sender.messages).toEqual([]);
	});

	it("AC-H10: ignores unrelated update types", async () => {
		await handle({ update_id: 13, edited_message: { message_id: 1 } });

		expect(capture.commands).toEqual([]);
		expect(sender.messages).toEqual([]);
	});
});
