// In-memory fakes for every core port. Owned by the tester role (CLAUDE.md).

import type {
	Input,
	Item,
	ItemEvent,
	Reminder,
	User,
} from "../../src/domain/types";
import type {
	Clock,
	IdGenerator,
	InputParser,
	JobScheduler,
	Notification,
	Notifier,
	ParseRequest,
	ParseResponse,
	Repositories,
	TransactionContext,
	UnitOfWork,
} from "../../src/ports";

export class FakeClock implements Clock {
	private current: Date;

	constructor(iso: string) {
		this.current = new Date(iso);
	}

	now(): Date {
		return new Date(this.current.getTime());
	}

	set(iso: string): void {
		this.current = new Date(iso);
	}
}

export class SequentialIds implements IdGenerator {
	private counter = 0;

	constructor(private readonly prefix = "id") {}

	next(): string {
		this.counter += 1;
		return `${this.prefix}-${this.counter}`;
	}
}

/** Returns queued responses (or errors) in order; throws when the script runs out. */
export class ScriptedParser implements InputParser {
	readonly requests: ParseRequest[] = [];
	private readonly queue: (ParseResponse | Error)[] = [];

	constructor(private readonly modelVersion = "fake-model-1") {}

	/** Queue a raw output (valid or deliberately invalid). */
	willReturn(...raws: unknown[]): this {
		for (const raw of raws) {
			this.queue.push({ raw, modelVersion: this.modelVersion });
		}
		return this;
	}

	/** Queue a failure (network error, 5xx, timeout). */
	willThrow(error: Error): this {
		this.queue.push(error);
		return this;
	}

	async parse(request: ParseRequest): Promise<ParseResponse> {
		this.requests.push(request);
		const next = this.queue.shift();
		if (!next) {
			throw new Error("ScriptedParser: no response queued");
		}
		if (next instanceof Error) throw next;
		return next;
	}
}

export interface FakeJob {
	jobId: string;
	reminderId: string;
	fireAt: Date;
	status: "queued" | "cancelled";
}

interface StoreState {
	users: User[];
	inputs: Input[];
	items: Item[];
	itemEvents: ItemEvent[];
	reminders: Reminder[];
	/** Jobs enqueued through the transactional JobScheduler. */
	jobs: FakeJob[];
}

/** When an item is scheduled: startsAt for events/reminders, dueAt for tasks. */
function itemTime(item: Item): Date | null {
	switch (item.type) {
		case "event":
		case "reminder":
			return item.startsAt;
		case "task":
			return item.dueAt;
		default:
			return null;
	}
}

type Table = Exclude<keyof StoreState, "jobs">;

function cloneState(state: StoreState): StoreState {
	return structuredClone(state);
}

/**
 * In-memory repositories, job queue and a UnitOfWork with real rollback
 * semantics: if the work throws, every write made inside it is discarded,
 * including enqueued jobs (mirrors pg-boss sending inside the transaction).
 */
export class InMemoryStore implements UnitOfWork {
	state: StoreState = {
		users: [],
		inputs: [],
		items: [],
		itemEvents: [],
		reminders: [],
		jobs: [],
	};

	/** Set to make the next insert into that table throw (simulates a DB failure). */
	failNextInsertInto: Table | null = null;
	/** Set to make the next job enqueue throw. */
	failNextSchedule = false;

	private jobCounter = 0;

	readonly repos: Repositories = {
		users: {
			findById: async (id) => this.state.users.find((u) => u.id === id) ?? null,
		},
		inputs: {
			insert: async (input) => this.insert("inputs", input),
			update: async (input) => {
				const index = this.state.inputs.findIndex((i) => i.id === input.id);
				if (index === -1) throw new Error(`input ${input.id} not found`);
				this.state.inputs[index] = structuredClone(input);
			},
		},
		items: {
			insert: async (item) => this.insert("items", item),
			listOpenInRange: async (ownerId, { from, to }) =>
				this.state.items
					.filter((item) => {
						if (item.ownerId !== ownerId || item.status !== "open") {
							return false;
						}
						const at = itemTime(item);
						return (
							at !== null &&
							at.getTime() >= from.getTime() &&
							at.getTime() < to.getTime()
						);
					})
					.map((item) => structuredClone(item)),
			listOpen: async (ownerId) =>
				this.state.items
					.filter((item) => item.ownerId === ownerId && item.status === "open")
					.map((item) => structuredClone(item)),
		},
		itemEvents: { insert: async (event) => this.insert("itemEvents", event) },
		reminders: {
			insert: async (reminder) => this.insert("reminders", reminder),
			setJobId: async (reminderId, jobId) => {
				const reminder = this.state.reminders.find((r) => r.id === reminderId);
				if (!reminder) throw new Error(`reminder ${reminderId} not found`);
				reminder.jobId = jobId;
			},
		},
	};

	private readonly jobs: JobScheduler = {
		scheduleReminder: async ({ reminderId, fireAt }) => {
			if (this.failNextSchedule) {
				this.failNextSchedule = false;
				throw new Error("simulated job queue failure");
			}
			this.jobCounter += 1;
			const jobId = `job-${this.jobCounter}`;
			this.state.jobs.push({
				jobId,
				reminderId,
				fireAt: new Date(fireAt),
				status: "queued",
			});
			return jobId;
		},
		cancel: async (jobId) => {
			const job = this.state.jobs.find((j) => j.jobId === jobId);
			if (job) job.status = "cancelled";
		},
	};

	addUser(user: User): this {
		this.state.users.push(user);
		return this;
	}

	async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
		const snapshot = cloneState(this.state);
		try {
			return await work({ ...this.repos, jobs: this.jobs });
		} catch (error) {
			this.state = snapshot;
			throw error;
		}
	}

	private insert<K extends Table>(table: K, row: StoreState[K][number]): void {
		if (this.failNextInsertInto === table) {
			this.failNextInsertInto = null;
			throw new Error(`simulated insert failure on ${table}`);
		}
		(this.state[table] as StoreState[K][number][]).push(structuredClone(row));
	}
}

export class RecordingNotifier implements Notifier {
	readonly sent: Notification[] = [];

	async notify(notification: Notification): Promise<void> {
		this.sent.push(notification);
	}
}
