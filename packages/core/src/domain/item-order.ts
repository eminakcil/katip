// In-day display order shared by the list commands (/bugun, /hafta, /liste).
import type { Item } from "./types";

/** The instant an item is scheduled for, or null for undated items. */
export function itemTime(item: Item): Date | null {
	return item.type === "task" ? item.dueAt : item.startsAt;
}

/** All-day items first by title, then timed items by time, then by title. */
export function compareItems(a: Item, b: Item): number {
	if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
	if (a.allDay) return a.title.localeCompare(b.title);
	const at = itemTime(a)?.getTime() ?? 0;
	const bt = itemTime(b)?.getTime() ?? 0;
	return at - bt || a.title.localeCompare(b.title);
}
