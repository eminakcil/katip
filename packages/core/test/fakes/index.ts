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

/** Returns queued responses in order; throws when the script runs out. */
export class ScriptedParser implements InputParser {
	readonly requests: ParseRequest[] = [];
	private readonly queue: ParseResponse[] = [];

	constructor(private readonly modelVersion = "fake-model-1") {}

	/** Queue a raw output (valid or deliberately invalid). */
	willReturn(...raws: unknown[]): this {
		for (const raw of raws) {
			this.queue.push({ raw, modelVersion: this.modelVersion });
		}
		return this;
	}

	async parse(request: ParseRequest): Promise<ParseResponse> {
		this.requests.push(request);
		const next = this.queue.shift();
		if (!next) {
			throw new Error("ScriptedParser: no response queued");
		}
		return next;
	}
}

interface StoreState {
	users: User[];
	inputs: Input[];
	items: Item[];
	itemEvents: ItemEvent[];
	reminders: Reminder[];
}

function cloneState(state: StoreState): StoreState {
	return structuredClone(state);
}

/**
 * In-memory repositories plus a UnitOfWork with real rollback semantics:
 * if the work throws, every write made inside it is discarded.
 */
export class InMemoryStore implements UnitOfWork {
	state: StoreState = {
		users: [],
		inputs: [],
		items: [],
		itemEvents: [],
		reminders: [],
	};

	/** Set to make the next insert into that table throw (simulates a DB failure). */
	failNextInsertInto: keyof StoreState | null = null;

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
		items: { insert: async (item) => this.insert("items", item) },
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

	addUser(user: User): this {
		this.state.users.push(user);
		return this;
	}

	async run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
		const snapshot = cloneState(this.state);
		try {
			return await work(this.repos);
		} catch (error) {
			this.state = snapshot;
			throw error;
		}
	}

	private insert<K extends keyof StoreState>(
		table: K,
		row: StoreState[K][number],
	): void {
		if (this.failNextInsertInto === table) {
			this.failNextInsertInto = null;
			throw new Error(`simulated insert failure on ${table}`);
		}
		(this.state[table] as StoreState[K][number][]).push(structuredClone(row));
	}
}

export class FakeJobScheduler implements JobScheduler {
	readonly scheduled: { jobId: string; reminderId: string; fireAt: Date }[] =
		[];
	readonly cancelled: string[] = [];
	private counter = 0;

	async scheduleReminder(job: {
		reminderId: string;
		fireAt: Date;
	}): Promise<string> {
		this.counter += 1;
		const jobId = `job-${this.counter}`;
		this.scheduled.push({ jobId, ...job });
		return jobId;
	}

	async cancel(jobId: string): Promise<void> {
		this.cancelled.push(jobId);
	}
}

export class RecordingNotifier implements Notifier {
	readonly sent: Notification[] = [];

	async notify(notification: Notification): Promise<void> {
		this.sent.push(notification);
	}
}
