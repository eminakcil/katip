// Production entry for Telegram updates (CLAUDE.md): the secret token is checked
// in constant time before the body is parsed or any handler runs.
import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";

export const SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

export function isValidSecretToken(
	received: string | undefined,
	expected: string,
): boolean {
	if (!received) return false;
	// Hash both sides so the comparison is constant-time regardless of length.
	const a = createHash("sha256").update(received).digest();
	const b = createHash("sha256").update(expected).digest();
	return timingSafeEqual(a, b);
}

export interface WebhookOptions {
	path: string;
	secret: string;
	handleUpdate: (update: unknown) => Promise<void>;
	onError?: (error: unknown) => void;
}

export function createWebhookApp(options: WebhookOptions): Hono {
	const app = new Hono();

	app.post(options.path, async (c) => {
		if (!isValidSecretToken(c.req.header(SECRET_HEADER), options.secret)) {
			return c.text("unauthorized", 401);
		}

		let update: unknown;
		try {
			update = await c.req.json();
		} catch {
			return c.text("bad request", 400);
		}

		try {
			await options.handleUpdate(update);
		} catch (error) {
			options.onError?.(error);
			// Non-2xx makes Telegram redeliver the update later.
			return c.text("error", 500);
		}
		return c.text("ok", 200);
	});

	return app;
}
