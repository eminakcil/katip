// Turkish date/time formatting for user-facing messages (CLAUDE.md language rule).
import { describe, expect, it } from "vitest";

import { formatDateTr, formatTimeTr, withLocative } from "./format";

describe("formatDateTr", () => {
	it("formats day, month and weekday in Turkish in the user's timezone", () => {
		expect(
			formatDateTr(new Date("2026-11-12T16:00:00Z"), "Europe/Istanbul"),
		).toBe("12 Kasım Perşembe");
	});

	it("uses the user's calendar day, not UTC's", () => {
		// 21:00 UTC on the 14th is 00:00 on the 15th in Istanbul.
		expect(
			formatDateTr(new Date("2026-11-14T21:00:00Z"), "Europe/Istanbul"),
		).toBe("15 Kasım Pazar");
		expect(
			formatDateTr(new Date("2026-11-14T21:00:00Z"), "America/New_York"),
		).toBe("14 Kasım Cumartesi");
	});
});

describe("formatTimeTr", () => {
	it("formats 24-hour HH:mm in the user's timezone", () => {
		expect(
			formatTimeTr(new Date("2026-11-12T16:00:00Z"), "Europe/Istanbul"),
		).toBe("19:00");
		expect(
			formatTimeTr(new Date("2026-11-12T06:05:00Z"), "Europe/Istanbul"),
		).toBe("09:05");
		expect(
			formatTimeTr(new Date("2026-11-14T21:00:00Z"), "Europe/Istanbul"),
		).toBe("00:00");
	});
});

describe("withLocative", () => {
	// The suffix follows the last spoken number: 18:30 → "otuz" → 'da.
	it.each([
		["18:30", "18:30'da"],
		["19:00", "19:00'da"],
		["09:00", "09:00'da"],
		["10:00", "10:00'da"],
		["11:00", "11:00'de"],
		["12:00", "12:00'de"],
		["13:00", "13:00'te"],
		["14:00", "14:00'te"],
		["15:00", "15:00'te"],
		["16:00", "16:00'da"],
		["17:00", "17:00'de"],
		["18:00", "18:00'de"],
		["20:00", "20:00'de"],
		["00:00", "00:00'da"],
		["08:15", "08:15'te"],
		["08:40", "08:40'ta"],
		["08:50", "08:50'de"],
		["07:05", "07:05'te"],
		["21:20", "21:20'de"],
		["23:59", "23:59'da"],
		["22:01", "22:01'de"],
		["05:06", "05:06'da"],
		["06:10", "06:10'da"],
	])("%s → %s", (time, expected) => {
		expect(withLocative(time)).toBe(expected);
	});
});
