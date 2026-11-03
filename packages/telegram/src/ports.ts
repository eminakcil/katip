// Interfaces the Telegram adapter depends on. Implemented by packages/db and by
// the grammY-backed sender in this package; faked in test/fakes.ts.
import type {
	CaptureInputCommand,
	CaptureInputResult,
	Item,
} from "@katip/core";

export interface InlineButton {
	text: string;
	callbackData: string;
}

export interface OutgoingMessage {
	text: string;
	buttons?: InlineButton[][];
}

export interface TelegramSender {
	sendMessage(
		chatId: number,
		message: OutgoingMessage,
	): Promise<{ messageId: number }>;
	answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}

/** Webhook idempotency by update_id (tg_processed_updates). */
export interface ProcessedUpdates {
	/** Returns false if the update was already claimed (a duplicate). */
	claim(updateId: number): Promise<boolean>;
	/** Undo a claim so Telegram's retry is processed (used when handling fails). */
	release(updateId: number): Promise<void>;
}

/** Telegram user id → internal user id, via channel_identities. */
export interface IdentityLookup {
	findUserId(telegramUserId: number): Promise<string | null>;
}

/** Bot message ↔ item, for reply-to-add-detail (tg_message_links). */
export interface MessageLinks {
	save(link: {
		chatId: number;
		messageId: number;
		itemId: string;
	}): Promise<void>;
}

export type CaptureInput = (
	command: CaptureInputCommand,
) => Promise<CaptureInputResult>;

/** Result of core's ListToday command (issue #6). */
export type ListTodayResult =
	| {
			kind: "listed";
			/** The user's local calendar day, "YYYY-MM-DD". */
			day: string;
			/** The user's IANA timezone; render times in it. */
			timezone: string;
			/** Already in display order. */
			items: Item[];
	  }
	| { kind: "unknown_user" };

export type ListToday = (command: {
	userId: string;
}) => Promise<ListTodayResult>;

/** Result of core's ListWeek command (issue #9). */
export type ListWeekResult =
	| {
			kind: "listed";
			/** The user's IANA timezone; render times in it. */
			timezone: string;
			/**
			 * Local calendar days ("YYYY-MM-DD") that have at least one item, in
			 * ascending order. Items within a day are already in display order.
			 */
			days: { day: string; items: Item[] }[];
	  }
	| { kind: "unknown_user" };

export type ListWeek = (command: { userId: string }) => Promise<ListWeekResult>;

/** Result of core's ListAll command (issue #22). */
export type ListAllResult =
	| {
			kind: "listed";
			/** The user's IANA timezone; render times in it. */
			timezone: string;
			/**
			 * Local calendar days ("YYYY-MM-DD") that have at least one shown dated
			 * item, oldest first (past days included). Items within a day are
			 * already in display order.
			 */
			days: { day: string; items: Item[] }[];
			/** Shown open notes, already in display order. */
			undated: Item[];
			/** How many open items were left out by the 20-item cap (0 if none). */
			more: number;
	  }
	| { kind: "unknown_user" };

export type ListAll = (command: { userId: string }) => Promise<ListAllResult>;

export interface UpdateHandlerDeps {
	sender: TelegramSender;
	processedUpdates: ProcessedUpdates;
	identities: IdentityLookup;
	messageLinks: MessageLinks;
	captureInput: CaptureInput;
	/** Core ListToday command, used by /bugun. */
	listToday: ListToday;
	/** Core ListWeek command, used by /hafta. */
	listWeek: ListWeek;
	/** Core ListAll command, used by /liste. */
	listAll: ListAll;
	clock: { now(): Date };
	/** Web app URL shown to unlinked users. */
	webAppUrl: string;
}
