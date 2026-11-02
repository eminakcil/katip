// OpenRouter InputParser adapter (ADR 0006). Never calls the network: fetch is injected.
//
// AC-L1 Sends one chat completion to OpenRouter with the configured model, the
//       API key, a strict JSON schema response format and a timeout signal.
// AC-L2 The prompt carries the user's text and "now" as local wall time in the
//       user's timezone.
// AC-L3 Returns the model's JSON as `raw` (unvalidated) and the served model as
//       `modelVersion`; non-JSON content is returned as a string for core to reject.
// AC-L4 HTTP errors, network errors and responses without content throw, so
//       core reports parser_unavailable.
import { describe, expect, it } from "vitest";

import { OpenRouterInputParser } from "./openrouter";

const request = {
	text: "Haftaya perşembe akşam 7'de yayın var, mutlaka izlemeliyim.",
	now: new Date("2026-11-06T09:00:00Z"),
	timezone: "Europe/Istanbul",
};

interface Call {
	url: string;
	init: RequestInit;
	body: {
		model: string;
		messages: { role: string; content: string }[];
		response_format: {
			type: string;
			json_schema: {
				name: string;
				strict: boolean;
				schema: Record<string, unknown>;
			};
		};
	};
}

function fakeFetch(response: Response | Error) {
	const calls: Call[] = [];
	const fetch = async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({
			url: String(url),
			init: init ?? {},
			body: JSON.parse(String(init?.body)),
		});
		if (response instanceof Error) throw response;
		return response;
	};
	return { calls, fetch: fetch as typeof globalThis.fetch };
}

function completion(
	content: unknown,
	model = "anthropic/claude-haiku-5.5-20261001",
) {
	return new Response(
		JSON.stringify({
			model,
			choices: [{ message: { role: "assistant", content } }],
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

function parser(fetch: typeof globalThis.fetch) {
	return new OpenRouterInputParser({
		apiKey: "sk-or-test",
		model: "anthropic/claude-haiku-5.5",
		fetch,
	});
}

describe("OpenRouterInputParser", () => {
	it("AC-L1: posts a strict JSON-schema chat completion with the configured model and key", async () => {
		const { calls, fetch } = fakeFetch(completion("{}"));
		await parser(fetch).parse(request);

		expect(calls).toHaveLength(1);
		const call = calls[0];
		expect(call?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
		expect(call?.init.method).toBe("POST");
		expect(new Headers(call?.init.headers).get("authorization")).toBe(
			"Bearer sk-or-test",
		);
		expect(call?.init.signal).toBeInstanceOf(AbortSignal);
		expect(call?.body.model).toBe("anthropic/claude-haiku-5.5");
		expect(call?.body.response_format.type).toBe("json_schema");
		expect(call?.body.response_format.json_schema.strict).toBe(true);
		expect(call?.body.response_format.json_schema.schema).toMatchObject({
			type: "object",
			additionalProperties: false,
			required: ["type", "title", "scope", "priority", "date", "time"],
		});
	});

	it("AC-L2: includes the text and the local date, weekday and time in the prompt", async () => {
		const { calls, fetch } = fakeFetch(completion("{}"));
		await parser(fetch).parse(request);

		const user =
			calls[0]?.body.messages.find((m) => m.role === "user")?.content ?? "";
		expect(user).toContain(request.text);
		// 09:00Z is 12:00 on Friday in Istanbul.
		expect(user).toContain("2026-11-06");
		expect(user).toContain("12:00");
		expect(user).toContain("Friday");
		expect(user).toContain("Europe/Istanbul");
		expect(calls[0]?.body.messages[0]?.role).toBe("system");
	});

	it("AC-L3: returns the parsed JSON and the served model", async () => {
		const item = {
			type: "event",
			title: "Yayın izle",
			scope: "personal",
			priority: "high",
			date: "2026-11-12",
			time: "19:00",
		};
		const { fetch } = fakeFetch(completion(JSON.stringify(item)));

		expect(await parser(fetch).parse(request)).toEqual({
			raw: item,
			modelVersion: "anthropic/claude-haiku-5.5-20261001",
		});
	});

	it("AC-L3: falls back to the configured model when the response omits it", async () => {
		const { fetch } = fakeFetch(
			new Response(
				JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
			),
		);

		expect((await parser(fetch).parse(request)).modelVersion).toBe(
			"anthropic/claude-haiku-5.5",
		);
	});

	it("AC-L3: returns non-JSON content as a string for core to reject", async () => {
		const { fetch } = fakeFetch(completion("Sorry, I can't help with that."));

		expect((await parser(fetch).parse(request)).raw).toBe(
			"Sorry, I can't help with that.",
		);
	});

	it("AC-L4: throws on an HTTP error status", async () => {
		const { fetch } = fakeFetch(
			new Response("upstream error", { status: 502 }),
		);

		await expect(parser(fetch).parse(request)).rejects.toThrow(/502/);
	});

	it("AC-L4: throws on a network error", async () => {
		const { fetch } = fakeFetch(new TypeError("fetch failed"));

		await expect(parser(fetch).parse(request)).rejects.toThrow("fetch failed");
	});

	it("AC-L4: throws when the response has no message content", async () => {
		const { fetch } = fakeFetch(new Response(JSON.stringify({ choices: [] })));

		await expect(parser(fetch).parse(request)).rejects.toThrow();
	});
});
