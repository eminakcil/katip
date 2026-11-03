// ListAll: every open item of a user, dated ones grouped by local day, then notes.
import { compareItems, itemTime } from "../domain/item-order";
import type { Item, UserId } from "../domain/types";
import type { Clock, Repositories } from "../ports";

export interface ListAllDeps {
	repos: Repositories;
	clock: Clock;
}

export interface ListAllCommand {
	userId: UserId;
}

export type ListAllResult =
	| {
			kind: "listed";
			timezone: string;
			/** Days with at least one shown item, oldest first, "YYYY-MM-DD". */
			days: { day: string; items: Item[] }[];
			/** Shown open notes, oldest first. */
			undated: Item[];
			/** Open items left out by the cap. */
			more: number;
	  }
	| { kind: "unknown_user" };

const MAX_ITEMS = 20;

function localDay(at: Date, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(at);
}

export function createListAll(deps: ListAllDeps) {
	return async (cmd: ListAllCommand): Promise<ListAllResult> => {
		const user = await deps.repos.users.findById(cmd.userId);
		if (!user) return { kind: "unknown_user" };

		const open = await deps.repos.items.listOpen(user.id);
		const dated = open
			.filter((item) => item.type !== "note" && itemTime(item) !== null)
			.map((item) => ({
				item,
				day: localDay(itemTime(item) as Date, user.timezone),
			}))
			.sort(
				(a, b) => a.day.localeCompare(b.day) || compareItems(a.item, b.item),
			);
		const notes = open
			.filter((item) => item.type === "note")
			.sort(
				(a, b) =>
					a.createdAt.getTime() - b.createdAt.getTime() ||
					a.title.localeCompare(b.title),
			);

		const shownDated = dated.slice(0, MAX_ITEMS);
		const shownNotes = notes.slice(0, MAX_ITEMS - shownDated.length);
		const days: { day: string; items: Item[] }[] = [];
		for (const { item, day } of shownDated) {
			const last = days[days.length - 1];
			if (last && last.day === day) last.items.push(item);
			else days.push({ day, items: [item] });
		}
		return {
			kind: "listed",
			timezone: user.timezone,
			days,
			undated: shownNotes,
			more: dated.length + notes.length - shownDated.length - shownNotes.length,
		};
	};
}
