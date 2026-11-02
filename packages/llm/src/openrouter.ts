// OpenRouter implementation of the core InputParser port (ADR 0006).
// Output is untrusted: core validates it with its Zod schema before use.
import type { InputParser, ParseRequest, ParseResponse } from "@katip/core";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface OpenRouterParserOptions {
	apiKey: string;
	/** OpenRouter model slug, e.g. "anthropic/claude-haiku-5.5". */
	model: string;
	baseUrl?: string;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

/** Mirrors core's parsedItemSchema (which remains the authority). */
const PARSED_ITEM_JSON_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["type", "title", "scope", "priority", "date", "time"],
	properties: {
		type: {
			type: "string",
			enum: ["event", "task", "reminder", "recurring", "annual", "note"],
		},
		title: { type: "string" },
		scope: { type: "string", enum: ["personal", "work", "other"] },
		priority: { type: "string", enum: ["normal", "high"] },
		date: {
			type: ["string", "null"],
			description: "Local date YYYY-MM-DD, or null",
		},
		time: {
			type: ["string", "null"],
			description: "Local 24h time HH:mm, or null",
		},
	},
} as const;

const SYSTEM_PROMPT = `You turn one Turkish message into one structured item for a personal assistant.

Fields:
- type: "event" (something happening at a time: meeting, stream, appointment), "task" (something to do by a day), "reminder" (the user asks to be reminded at a time), "recurring" (repeats, e.g. "her ayın 15'i"), "annual" (yearly date, e.g. a birthday), "note" (information with no time).
- title: short Turkish title, like the user would write in a to-do list ("Yayın izle", "Araç muayenesi"). No date or time words in the title.
- scope: "work" for work matters, "personal" for personal life, "other" if unclear.
- priority: "high" if the user signals urgency or importance ("mutlaka", "acil", "önemli", "kesin"), else "normal".
- date: the local calendar date (YYYY-MM-DD) the item happens or is due, resolved relative to the given current local time. Null if no day is implied.
- time: the local time (HH:mm, 24-hour) if one is given or clearly implied ("akşam 7" = 19:00, "sabah 9" = 09:00, "öğlen" = 12:00). Null if no time is given.

Rules:
- Resolve relative dates against the current local date: "yarın" = tomorrow, "haftaya perşembe" = Thursday of next week, "ay sonu" = the last day of this month.
- An event or reminder needs both date and time. A task needs a date; time is optional. A note has neither.
- Never invent a time the user did not give or imply.
- Answer with the JSON object only.`;

function localNow(now: Date, timeZone: string): string {
	const date = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const weekday = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "long",
	}).format(now);
	const time = new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(now);
	return `${date} (${weekday}) ${time}, timezone ${timeZone}`;
}

export class OpenRouterInputParser implements InputParser {
	private readonly fetch: typeof globalThis.fetch;

	constructor(private readonly options: OpenRouterParserOptions) {
		this.fetch = options.fetch ?? globalThis.fetch;
	}

	async parse(request: ParseRequest): Promise<ParseResponse> {
		const { apiKey, model } = this.options;
		const baseUrl = this.options.baseUrl ?? DEFAULT_BASE_URL;

		const response = await this.fetch(`${baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
				"x-title": "Katip",
			},
			signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
			body: JSON.stringify({
				model,
				messages: [
					{ role: "system", content: SYSTEM_PROMPT },
					{
						role: "user",
						content: `Current local time: ${localNow(request.now, request.timezone)}\n\nMessage:\n${request.text}`,
					},
				],
				response_format: {
					type: "json_schema",
					json_schema: {
						name: "parsed_item",
						strict: true,
						schema: PARSED_ITEM_JSON_SCHEMA,
					},
				},
			}),
		});

		if (!response.ok) {
			throw new Error(
				`OpenRouter request failed with status ${response.status}`,
			);
		}

		const body = (await response.json()) as {
			model?: string;
			choices?: { message?: { content?: unknown } }[];
		};
		const content = body.choices?.[0]?.message?.content;
		if (typeof content !== "string") {
			throw new Error("OpenRouter response has no message content");
		}

		return { raw: parseJson(content), modelVersion: body.model ?? model };
	}
}

function parseJson(content: string): unknown {
	try {
		return JSON.parse(content);
	} catch {
		return content;
	}
}
