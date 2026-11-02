// Telegram webhook route (CLAUDE.md, ADR 0002).
//
// AC-W1 Requests without a matching X-Telegram-Bot-Api-Secret-Token get 401,
//       before the body is parsed, and the handler is not called.
// AC-W2 Valid requests pass the parsed update to the handler and get 200.
// AC-W3 A malformed body with a valid secret gets 400.
// AC-W4 A handler failure gets 500 so Telegram retries.
import { describe, expect, it } from "vitest";

import { createWebhookApp, isValidSecretToken } from "./webhook";

const SECRET = "s3cret-token_ABC";
const HEADER = "X-Telegram-Bot-Api-Secret-Token";

function setup(handler?: (update: unknown) => Promise<void>) {
	const received: unknown[] = [];
	const app = createWebhookApp({
		path: "/telegram/webhook",
		secret: SECRET,
		handleUpdate:
			handler ??
			(async (update) => {
				received.push(update);
			}),
	});
	const post = (body: string, headers: Record<string, string> = {}) =>
		app.request("/telegram/webhook", {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body,
		});
	return { received, post };
}

describe("isValidSecretToken", () => {
	it("accepts only the exact secret", () => {
		expect(isValidSecretToken(SECRET, SECRET)).toBe(true);
		expect(isValidSecretToken("s3cret-token_ABD", SECRET)).toBe(false);
		expect(isValidSecretToken(`${SECRET}x`, SECRET)).toBe(false);
		expect(isValidSecretToken("", SECRET)).toBe(false);
		expect(isValidSecretToken(undefined, SECRET)).toBe(false);
	});
});

describe("webhook route", () => {
	it("AC-W1: rejects a request without the secret header", async () => {
		const { received, post } = setup();
		const response = await post('{"update_id":1}');

		expect(response.status).toBe(401);
		expect(received).toEqual([]);
	});

	it("AC-W1: rejects a wrong secret", async () => {
		const { received, post } = setup();
		const response = await post('{"update_id":1}', { [HEADER]: "wrong" });

		expect(response.status).toBe(401);
		expect(received).toEqual([]);
	});

	it("AC-W1: rejects a wrong secret before parsing a malformed body", async () => {
		const { post } = setup();
		const response = await post("{not json", { [HEADER]: "wrong" });

		expect(response.status).toBe(401);
	});

	it("AC-W2: passes the parsed update to the handler", async () => {
		const { received, post } = setup();
		const response = await post('{"update_id":7,"message":{"text":"hi"}}', {
			[HEADER]: SECRET,
		});

		expect(response.status).toBe(200);
		expect(received).toEqual([{ update_id: 7, message: { text: "hi" } }]);
	});

	it("AC-W3: answers 400 to a malformed body with a valid secret", async () => {
		const { received, post } = setup();
		const response = await post("{not json", { [HEADER]: SECRET });

		expect(response.status).toBe(400);
		expect(received).toEqual([]);
	});

	it("AC-W4: answers 500 when the handler fails", async () => {
		const { post } = setup(async () => {
			throw new Error("boom");
		});
		const response = await post('{"update_id":8}', { [HEADER]: SECRET });

		expect(response.status).toBe(500);
	});
});
