// Domain types. Channel-agnostic: no adapter concepts here.
// All instants are UTC `Date`s; wall-clock values only exist at the edges.

export const ITEM_TYPES = [
	"event",
	"task",
	"reminder",
	"recurring",
	"annual",
	"note",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const SCOPES = ["personal", "work", "other"] as const;
export type Scope = (typeof SCOPES)[number];

export const PRIORITIES = ["normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type ItemStatus = "open" | "done" | "cancelled";

export type UserId = string;

export interface User {
	id: UserId;
	/** IANA timezone, e.g. "Europe/Istanbul". */
	timezone: string;
}

/** Opaque channel name supplied by the adapter (core never interprets it). */
export type Channel = string;

export type InputKind = "text" | "audio";

/** One call to the parser, kept for the eval set whether it worked or not. */
export interface ParseAttempt {
	/** Raw output; null when the parser call failed. */
	raw: unknown;
	valid: boolean;
	modelVersion: string | null;
	/** Failure message when the parser call threw (network, 5xx, timeout). */
	error: string | null;
}

export interface Input {
	id: string;
	userId: UserId;
	channel: Channel;
	kind: InputKind;
	rawText: string | null;
	transcript: string | null;
	/** Last raw parser output, stored as-is for the eval set (valid or not). */
	parseResult: unknown;
	/** Whether `parseResult` passed schema validation. */
	parseValid: boolean | null;
	/** Every parser attempt in order, including invalid and failed ones. */
	parseAttempts: ParseAttempt[];
	modelVersion: string | null;
	corrected: boolean;
	createdAt: Date;
}

export interface Item {
	id: string;
	ownerId: UserId;
	createdBy: UserId;
	type: ItemType;
	title: string;
	scope: Scope;
	priority: Priority;
	status: ItemStatus;
	/** Start instant for events and reminders. */
	startsAt: Date | null;
	/** Due instant for tasks. */
	dueAt: Date | null;
	/** True when the user gave a date without a time. */
	allDay: boolean;
	sourceInputId: string | null;
	createdAt: Date;
}

export type ItemEventKind = "created";

export interface ItemEvent {
	id: string;
	itemId: string;
	event: ItemEventKind;
	at: Date;
}

export type ReminderStatus = "pending" | "sent" | "cancelled";

export interface Reminder {
	id: string;
	itemId: string;
	fireAt: Date;
	status: ReminderStatus;
	sentAt: Date | null;
	jobId: string | null;
}
