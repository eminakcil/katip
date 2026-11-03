// Fakes for the Telegram adapter's ports. Owned by the tester role.
import type { CaptureInputCommand, CaptureInputResult } from "@katip/core";

import type {
	IdentityLookup,
	ListTodayResult,
	ListWeekResult,
	MessageLinks,
	OutgoingMessage,
	ProcessedUpdates,
	TelegramSender,
} from "../src/ports";

export class RecordingSender implements TelegramSender {
	readonly messages: {
		chatId: number;
		message: OutgoingMessage;
		messageId: number;
	}[] = [];
	readonly callbackAnswers: { id: string; text?: string }[] = [];
	private nextMessageId = 500;

	async sendMessage(chatId: number, message: OutgoingMessage) {
		const messageId = this.nextMessageId++;
		this.messages.push({ chatId, message, messageId });
		return { messageId };
	}

	async answerCallbackQuery(id: string, text?: string) {
		this.callbackAnswers.push({ id, text });
	}
}

export class InMemoryProcessedUpdates implements ProcessedUpdates {
	readonly claimed = new Set<number>();

	async claim(updateId: number) {
		if (this.claimed.has(updateId)) return false;
		this.claimed.add(updateId);
		return true;
	}

	async release(updateId: number) {
		this.claimed.delete(updateId);
	}
}

export class MapIdentities implements IdentityLookup {
	constructor(private readonly map: Record<number, string> = {}) {}

	async findUserId(telegramUserId: number) {
		return this.map[telegramUserId] ?? null;
	}
}

export class RecordingLinks implements MessageLinks {
	readonly saved: { chatId: number; messageId: number; itemId: string }[] = [];

	async save(link: { chatId: number; messageId: number; itemId: string }) {
		this.saved.push(link);
	}
}

/** Returns a canned result (or throws) and records commands. */
export class ScriptedCapture {
	readonly commands: CaptureInputCommand[] = [];
	result: CaptureInputResult | Error = { kind: "unknown_user" };

	readonly run = async (
		command: CaptureInputCommand,
	): Promise<CaptureInputResult> => {
		this.commands.push(command);
		if (this.result instanceof Error) throw this.result;
		return this.result;
	};
}

/** Returns a canned ListToday result (or throws) and records commands. */
export class ScriptedListToday {
	readonly commands: { userId: string }[] = [];
	result: ListTodayResult | Error = { kind: "unknown_user" };

	readonly run = async (command: {
		userId: string;
	}): Promise<ListTodayResult> => {
		this.commands.push(command);
		if (this.result instanceof Error) throw this.result;
		return this.result;
	};
}

/** Returns a canned ListWeek result (or throws) and records commands. */
export class ScriptedListWeek {
	readonly commands: { userId: string }[] = [];
	result: ListWeekResult | Error = { kind: "unknown_user" };

	readonly run = async (command: {
		userId: string;
	}): Promise<ListWeekResult> => {
		this.commands.push(command);
		if (this.result instanceof Error) throw this.result;
		return this.result;
	};
}

export function textUpdate(
	updateId: number,
	text: string,
	opts: { fromId?: number; chatId?: number; chatType?: string } = {},
) {
	const fromId = opts.fromId ?? 42;
	return {
		update_id: updateId,
		message: {
			message_id: 10,
			date: 1_700_000_000,
			chat: { id: opts.chatId ?? fromId, type: opts.chatType ?? "private" },
			from: { id: fromId, is_bot: false, first_name: "Emin" },
			text,
		},
	};
}
