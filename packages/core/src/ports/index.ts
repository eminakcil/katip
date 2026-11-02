// Ports: the only way core talks to the outside world (ADR 0002).
// Types only. Implementations live in adapters; in-memory fakes in test/fakes.

import type {
	Input,
	Item,
	ItemEvent,
	Reminder,
	User,
	UserId,
} from "../domain/types";

export interface Clock {
	now(): Date;
}

export interface IdGenerator {
	next(): string;
}

export interface ParseRequest {
	text: string;
	/** Reference instant for resolving relative expressions. */
	now: Date;
	/** IANA timezone of the user; relative dates are resolved in it. */
	timezone: string;
}

export interface ParseResponse {
	/** Raw model output. Untrusted: core validates it before use. */
	raw: unknown;
	modelVersion: string;
}

/** LLM-backed parser that turns free text into a candidate item. */
export interface InputParser {
	parse(request: ParseRequest): Promise<ParseResponse>;
}

export interface SpeechToText {
	transcribe(audio: {
		data: Uint8Array;
		mimeType: string;
	}): Promise<{ text: string; modelVersion: string }>;
}

export interface UserRepository {
	findById(id: UserId): Promise<User | null>;
}

export interface InputRepository {
	insert(input: Input): Promise<void>;
	update(input: Input): Promise<void>;
}

export interface ItemRepository {
	insert(item: Item): Promise<void>;
}

export interface ItemEventRepository {
	insert(event: ItemEvent): Promise<void>;
}

export interface ReminderRepository {
	insert(reminder: Reminder): Promise<void>;
	setJobId(reminderId: string, jobId: string): Promise<void>;
}

export interface Repositories {
	users: UserRepository;
	inputs: InputRepository;
	items: ItemRepository;
	itemEvents: ItemEventRepository;
	reminders: ReminderRepository;
}

/** Runs `work` atomically: all repository writes inside commit or none do. */
export interface UnitOfWork {
	run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}

/** Durable job queue for reminder delivery (ADR 0008). */
export interface JobScheduler {
	/** Enqueue delivery of one reminder occurrence. Returns the job id. */
	scheduleReminder(job: { reminderId: string; fireAt: Date }): Promise<string>;
	cancel(jobId: string): Promise<void>;
}

export type Notification = {
	kind: "reminder_due";
	userId: UserId;
	item: Item;
	reminder: Reminder;
};

/** Delivers notifications to the user's linked channel. */
export interface Notifier {
	notify(notification: Notification): Promise<void>;
}
