// Drizzle implementations of the core repository ports and UnitOfWork.
import type {
	Input,
	Item,
	ItemEvent,
	JobScheduler,
	Reminder,
	Repositories,
	TransactionContext,
	UnitOfWork,
	User,
} from "@katip/core";
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { relations } from "./relations";
import { user } from "./schema/auth";
import { inputs, itemEvents, items, reminders } from "./schema/core";

/** Any async Drizzle Postgres database (node-postgres in prod, PGlite in tests). */
export type AnyDatabase = PgAsyncDatabase<PgQueryResultHKT, typeof relations>;
export type AnyTransaction = Parameters<
	Parameters<AnyDatabase["transaction"]>[0]
>[0];
type Executor = Pick<AnyDatabase, "select" | "insert" | "update">;

export function createRepositories(db: Executor): Repositories {
	return {
		users: {
			async findById(id): Promise<User | null> {
				const [row] = await db
					.select({ id: user.id, timezone: user.timezone })
					.from(user)
					.where(eq(user.id, id))
					.limit(1);
				return row ?? null;
			},
		},
		inputs: {
			async insert(input: Input) {
				await db.insert(inputs).values(toInputRow(input));
			},
			async update(input: Input) {
				await db
					.update(inputs)
					.set(toInputRow(input))
					.where(eq(inputs.id, input.id));
			},
		},
		items: {
			async insert(item: Item) {
				await db.insert(items).values(item);
			},
			async listOpenInRange(ownerId, range) {
				return db
					.select()
					.from(items)
					.where(
						and(
							eq(items.ownerId, ownerId),
							eq(items.status, "open"),
							or(
								and(
									inArray(items.type, ["event", "reminder"]),
									gte(items.startsAt, range.from),
									lt(items.startsAt, range.to),
								),
								and(
									eq(items.type, "task"),
									gte(items.dueAt, range.from),
									lt(items.dueAt, range.to),
								),
							),
						),
					);
			},
		},
		itemEvents: {
			async insert(event: ItemEvent) {
				await db.insert(itemEvents).values(event);
			},
		},
		reminders: {
			async insert(reminder: Reminder) {
				await db.insert(reminders).values(reminder);
			},
			async setJobId(reminderId: string, jobId: string) {
				await db
					.update(reminders)
					.set({ jobId })
					.where(eq(reminders.id, reminderId));
			},
		},
	};
}

function toInputRow(input: Input) {
	return {
		...input,
		parseResult: input.parseResult ?? null,
	};
}

/** Builds the job scheduler bound to a transaction (pg-boss in production). */
export type JobSchedulerFactory = (tx: AnyTransaction) => JobScheduler;

export class DrizzleUnitOfWork implements UnitOfWork {
	constructor(
		private readonly db: AnyDatabase,
		private readonly jobsFor: JobSchedulerFactory,
	) {}

	run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
		return this.db.transaction((tx) =>
			work({ ...createRepositories(tx), jobs: this.jobsFor(tx) }),
		);
	}
}
