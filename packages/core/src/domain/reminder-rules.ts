// Default reminder times per item type (docs/project-brief.md, "Item types").
import type { ParsedItem } from "./parsed-item";
import { localToUtc } from "./time";

export const EVENT_LEAD_MINUTES = 30;
export const TASK_REMINDER_TIME = "09:00";

/**
 * Fire times for a newly captured item, in UTC. Times before `now` are dropped:
 * a reminder that can no longer fire on time is not created.
 * Recurring and annual items are not supported yet and get none.
 */
export function defaultReminderTimes(
	parsed: ParsedItem,
	timezone: string,
	now: Date,
): Date[] {
	const times: Date[] = [];
	const { date, time } = parsed;

	if (parsed.type === "event" && date && time) {
		const start = localToUtc(date, time, timezone);
		times.push(new Date(start.getTime() - EVENT_LEAD_MINUTES * 60_000));
	} else if (parsed.type === "reminder" && date && time) {
		times.push(localToUtc(date, time, timezone));
	} else if (parsed.type === "task" && date) {
		times.push(localToUtc(date, TASK_REMINDER_TIME, timezone));
	}

	return times.filter((fireAt) => fireAt.getTime() >= now.getTime());
}
