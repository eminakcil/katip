import { TZDate } from "@date-fns/tz";

/**
 * Converts a wall-clock date ("YYYY-MM-DD") and time ("HH:mm") in an IANA
 * timezone to a UTC instant.
 */
export function localToUtc(date: string, time: string, timezone: string): Date {
	const [year, month, day] = date.split("-").map(Number) as [
		number,
		number,
		number,
	];
	const [hour, minute] = time.split(":").map(Number) as [number, number];
	const zoned = new TZDate(year, month - 1, day, hour, minute, timezone);
	return new Date(zoned.getTime());
}
