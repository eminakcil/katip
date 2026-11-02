// Contract for parser (LLM) output. Every parse is validated against this
// schema before use; invalid output never reaches the database (ADR 0006).
import { z } from "zod";

import { ITEM_TYPES, PRIORITIES, SCOPES } from "./types";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isCalendarDate(value: string): boolean {
	const match = DATE.exec(value);
	if (!match) return false;
	const [year, month, day] = [
		Number(match[1]),
		Number(match[2]),
		Number(match[3]),
	];
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

/** Wall-clock date in the user's timezone, "YYYY-MM-DD". */
const localDate = z.string().refine(isCalendarDate);
/** Wall-clock time in the user's timezone, "HH:mm". */
const localTime = z.string().regex(TIME);

const NEEDS_DATE_AND_TIME = new Set(["event", "reminder"]);

export const parsedItemSchema = z
	.object({
		type: z.enum(ITEM_TYPES),
		title: z.string().trim().min(1).max(200),
		scope: z.enum(SCOPES),
		priority: z.enum(PRIORITIES),
		date: localDate.nullable(),
		time: localTime.nullable(),
	})
	.superRefine((item, ctx) => {
		const issue = (message: string) =>
			ctx.addIssue({ code: "custom", message });
		if (item.time !== null && item.date === null) {
			issue("time requires a date");
		}
		if (
			NEEDS_DATE_AND_TIME.has(item.type) &&
			(item.date === null || item.time === null)
		) {
			issue(`${item.type} requires a date and a time`);
		}
		if (item.type === "task" && item.date === null) {
			issue("task requires a date");
		}
		if (item.type === "note" && item.date !== null) {
			issue("note must not have a date");
		}
	});

export type ParsedItem = z.infer<typeof parsedItemSchema>;
