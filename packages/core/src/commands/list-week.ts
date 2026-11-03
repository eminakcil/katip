// ListWeek: the user's open items for the 7 local calendar days starting today.
import type { Item, UserId } from "../domain/types";
import type { Clock, Repositories } from "../ports";
import { createListItems } from "./list-items";

export interface ListWeekDeps {
	repos: Repositories;
	clock: Clock;
}

export interface ListWeekCommand {
	userId: UserId;
}

export type ListWeekResult =
	| {
			kind: "listed";
			timezone: string;
			/** Days with at least one item, ascending, "YYYY-MM-DD". */
			days: { day: string; items: Item[] }[];
	  }
	| { kind: "unknown_user" };

const WEEK_DAYS = 7;

/** Calendar day of `now` in `timeZone` as "YYYY-MM-DD". */
function localDay(now: Date, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

function addDays(day: string, count: number): string {
	const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, date + count))
		.toISOString()
		.slice(0, 10);
}

export function createListWeek(deps: ListWeekDeps) {
	const listItems = createListItems({ repos: deps.repos });
	return async (cmd: ListWeekCommand): Promise<ListWeekResult> => {
		const user = await deps.repos.users.findById(cmd.userId);
		if (!user) return { kind: "unknown_user" };

		const today = localDay(deps.clock.now(), user.timezone);
		const days: { day: string; items: Item[] }[] = [];
		for (let offset = 0; offset < WEEK_DAYS; offset++) {
			const day = addDays(today, offset);
			const result = await listItems({ userId: user.id, day });
			if (result.kind !== "listed") return { kind: "unknown_user" };
			if (result.items.length > 0) days.push({ day, items: result.items });
		}
		return { kind: "listed", timezone: user.timezone, days };
	};
}
