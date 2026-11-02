// CaptureInput: free text from any channel → stored input → validated parse →
// item + created event + default reminders (ADR 0002, 0006, 0008).
import { type ParsedItem, parsedItemSchema } from "../domain/parsed-item";
import { defaultReminderTimes } from "../domain/reminder-rules";
import { localToUtc } from "../domain/time";
import type {
	Channel,
	Input,
	Item,
	ItemType,
	Reminder,
	UserId,
} from "../domain/types";
import type {
	Clock,
	IdGenerator,
	InputParser,
	Repositories,
	UnitOfWork,
} from "../ports";

export interface CaptureInputDeps {
	clock: Clock;
	ids: IdGenerator;
	parser: InputParser;
	uow: UnitOfWork;
	/** Non-transactional repositories for reads and the raw input record. */
	repos: Repositories;
}

export interface CaptureInputCommand {
	userId: UserId;
	channel: Channel;
	text: string;
}

export type CaptureInputResult =
	| { kind: "captured"; item: Item; reminders: Reminder[]; timezone: string }
	| { kind: "needs_clarification"; inputId: string }
	| { kind: "unsupported_type"; inputId: string; type: ItemType }
	| { kind: "unknown_user" };

/** One retry after invalid output, then the user is asked (CLAUDE.md). */
const MAX_PARSE_ATTEMPTS = 2;
const UNSUPPORTED_TYPES: ReadonlySet<ItemType> = new Set([
	"recurring",
	"annual",
]);

export function createCaptureInput(deps: CaptureInputDeps) {
	const { clock, ids, parser, uow, repos } = deps;

	return async function captureInput(
		command: CaptureInputCommand,
	): Promise<CaptureInputResult> {
		const user = await repos.users.findById(command.userId);
		if (!user) return { kind: "unknown_user" };

		const now = clock.now();
		const input: Input = {
			id: ids.next(),
			userId: user.id,
			channel: command.channel,
			kind: "text",
			rawText: command.text,
			transcript: null,
			parseResult: null,
			parseValid: null,
			modelVersion: null,
			corrected: false,
			createdAt: now,
		};
		await repos.inputs.insert(input);

		let parsed: ParsedItem | null = null;
		for (let attempt = 0; attempt < MAX_PARSE_ATTEMPTS && !parsed; attempt++) {
			const response = await parser.parse({
				text: command.text,
				now,
				timezone: user.timezone,
			});
			const validation = parsedItemSchema.safeParse(response.raw);
			input.parseResult = response.raw;
			input.parseValid = validation.success;
			input.modelVersion = response.modelVersion;
			parsed = validation.success ? validation.data : null;
		}
		await repos.inputs.update(input);

		if (!parsed) return { kind: "needs_clarification", inputId: input.id };
		if (UNSUPPORTED_TYPES.has(parsed.type)) {
			return { kind: "unsupported_type", inputId: input.id, type: parsed.type };
		}

		const item = buildItem(parsed, {
			id: ids.next(),
			userId: user.id,
			timezone: user.timezone,
			sourceInputId: input.id,
			now,
		});
		const reminders: Reminder[] = defaultReminderTimes(
			parsed,
			user.timezone,
			now,
		).map((fireAt) => ({
			id: ids.next(),
			itemId: item.id,
			fireAt,
			status: "pending",
			sentAt: null,
			jobId: null,
		}));
		const eventId = ids.next();

		await uow.run(async (tx) => {
			await tx.items.insert(item);
			await tx.itemEvents.insert({
				id: eventId,
				itemId: item.id,
				event: "created",
				at: now,
			});
			// Jobs are enqueued in the same transaction (ADR 0008): a reminder row
			// never exists without its job, and a job never outlives a rollback.
			for (const reminder of reminders) {
				reminder.jobId = await tx.jobs.scheduleReminder({
					reminderId: reminder.id,
					fireAt: reminder.fireAt,
				});
				await tx.reminders.insert(reminder);
			}
		});

		return { kind: "captured", item, reminders, timezone: user.timezone };
	};
}

function buildItem(
	parsed: ParsedItem,
	ctx: {
		id: string;
		userId: UserId;
		timezone: string;
		sourceInputId: string;
		now: Date;
	},
): Item {
	const { date, time } = parsed;
	const at = date ? localToUtc(date, time ?? "00:00", ctx.timezone) : null;
	const isTask = parsed.type === "task";

	return {
		id: ctx.id,
		ownerId: ctx.userId,
		createdBy: ctx.userId,
		type: parsed.type,
		title: parsed.title,
		scope: parsed.scope,
		priority: parsed.priority,
		status: "open",
		startsAt: isTask ? null : at,
		dueAt: isTask ? at : null,
		allDay: date !== null && time === null,
		sourceInputId: ctx.sourceInputId,
		createdAt: ctx.now,
	};
}
