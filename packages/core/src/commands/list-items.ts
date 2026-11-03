// ListItems: a user's open items for one calendar day in their own timezone.
import { localToUtc } from "../domain/time";
import type { Item, UserId } from "../domain/types";
import type { Repositories } from "../ports";

export interface ListItemsDeps {
	repos: Repositories;
}

export interface ListItemsCommand {
	userId: UserId;
	/** Local calendar day, "YYYY-MM-DD". */
	day: string;
}

export type ListItemsResult =
	| { kind: "listed"; items: Item[] }
	| { kind: "unknown_user" }
	| { kind: "invalid_day" };

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Returns the following calendar day as "YYYY-MM-DD", or null if `day` is invalid. */
function nextDay(day: string): string | null {
	const match = DAY.exec(day);
	if (!match) return null;
	const [year, month, date] = [
		Number(match[1]),
		Number(match[2]),
		Number(match[3]),
	];
	const parsed = new Date(Date.UTC(year, month - 1, date));
	if (
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() !== month - 1 ||
		parsed.getUTCDate() !== date
	) {
		return null;
	}
	return new Date(Date.UTC(year, month - 1, date + 1))
		.toISOString()
		.slice(0, 10);
}

function timeOf(item: Item): number {
	const at = item.type === "task" ? item.dueAt : item.startsAt;
	return at ? at.getTime() : 0;
}

function compareItems(a: Item, b: Item): number {
	if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
	if (a.allDay) return a.title.localeCompare(b.title);
	return timeOf(a) - timeOf(b) || a.title.localeCompare(b.title);
}

export function createListItems(deps: ListItemsDeps) {
	return async (cmd: ListItemsCommand): Promise<ListItemsResult> => {
		const user = await deps.repos.users.findById(cmd.userId);
		if (!user) return { kind: "unknown_user" };

		const next = nextDay(cmd.day);
		if (next === null) return { kind: "invalid_day" };

		const items = await deps.repos.items.listOpenInRange(user.id, {
			from: localToUtc(cmd.day, "00:00", user.timezone),
			to: localToUtc(next, "00:00", user.timezone),
		});
		return { kind: "listed", items: [...items].sort(compareItems) };
	};
}
