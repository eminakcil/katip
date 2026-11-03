// ListToday: the items for the current calendar day in the user's timezone.
import type { Item, UserId } from "../domain/types";
import type { Clock, Repositories } from "../ports";
import { createListItems } from "./list-items";

export interface ListTodayDeps {
	repos: Repositories;
	clock: Clock;
}

export interface ListTodayCommand {
	userId: UserId;
}

export type ListTodayResult =
	| {
			kind: "listed";
			/** The user's local calendar day, "YYYY-MM-DD". */
			day: string;
			timezone: string;
			items: Item[];
	  }
	| { kind: "unknown_user" };

/** Calendar day of `now` in `timeZone` as "YYYY-MM-DD". */
function localDay(now: Date, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

export function createListToday(deps: ListTodayDeps) {
	const listItems = createListItems({ repos: deps.repos });
	return async (cmd: ListTodayCommand): Promise<ListTodayResult> => {
		const user = await deps.repos.users.findById(cmd.userId);
		if (!user) return { kind: "unknown_user" };

		const day = localDay(deps.clock.now(), user.timezone);
		const result = await listItems({ userId: user.id, day });
		if (result.kind !== "listed") return { kind: "unknown_user" };
		return {
			kind: "listed",
			day,
			timezone: user.timezone,
			items: result.items,
		};
	};
}
