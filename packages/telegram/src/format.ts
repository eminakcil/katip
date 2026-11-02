// tr-TR date/time formatting in the user's timezone, e.g. "12 Kasım Perşembe 19:00".

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const timeFormats = new Map<string, Intl.DateTimeFormat>();
const dayKeyFormats = new Map<string, Intl.DateTimeFormat>();

function cached(
	cache: Map<string, Intl.DateTimeFormat>,
	timeZone: string,
	create: (timeZone: string) => Intl.DateTimeFormat,
): Intl.DateTimeFormat {
	let format = cache.get(timeZone);
	if (!format) {
		format = create(timeZone);
		cache.set(timeZone, format);
	}
	return format;
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
	return parts.find((p) => p.type === type)?.value ?? "";
}

/** "12 Kasım Perşembe" */
export function formatDateTr(date: Date, timeZone: string): string {
	const parts = cached(
		dateFormats,
		timeZone,
		(tz) =>
			new Intl.DateTimeFormat("tr-TR", {
				timeZone: tz,
				day: "numeric",
				month: "long",
				weekday: "long",
			}),
	).formatToParts(date);
	return `${part(parts, "day")} ${part(parts, "month")} ${part(parts, "weekday")}`;
}

/** "19:00" (24-hour) */
export function formatTimeTr(date: Date, timeZone: string): string {
	const parts = cached(
		timeFormats,
		timeZone,
		(tz) =>
			new Intl.DateTimeFormat("tr-TR", {
				timeZone: tz,
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			}),
	).formatToParts(date);
	return `${part(parts, "hour")}:${part(parts, "minute")}`;
}

/** Calendar day in the timezone as "YYYY-MM-DD", for same-day comparisons. */
export function localDayKey(date: Date, timeZone: string): string {
	return cached(
		dayKeyFormats,
		timeZone,
		(tz) =>
			new Intl.DateTimeFormat("en-CA", {
				timeZone: tz,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			}),
	).format(date);
}

// Locative suffix by the last spoken number word (vowel harmony + consonant
// hardening): bir'de, iki'de, üç'te, dört'te, beş'te, altı'da, yedi'de,
// sekiz'de, dokuz'da; on'da, yirmi'de, otuz'da, kırk'ta, elli'de; sıfır'da.
const UNIT_SUFFIX = [
	"da",
	"de",
	"de",
	"te",
	"te",
	"te",
	"da",
	"de",
	"de",
	"da",
];
const TENS_SUFFIX = ["da", "da", "de", "da", "ta", "de"];

/** "18:30" → "18:30'da", "15:00" → "15:00'te" */
export function withLocative(time: string): string {
	const [hour, minute] = time.split(":").map(Number) as [number, number];
	const spoken = minute !== 0 ? minute : hour;
	const unit = spoken % 10;
	const suffix =
		unit !== 0 ? UNIT_SUFFIX[unit] : TENS_SUFFIX[Math.floor(spoken / 10)];
	return `${time}'${suffix}`;
}
