// DEV ONLY: link a Telegram account to an existing (Google-signed-in) user,
// until the real /start <token> linking flow exists. A CLI script, never an
// HTTP route, and it refuses to run in production.
//
// Usage (from apps/server): npm run dev:link-telegram -- <email> <telegram-user-id>
// Your numeric Telegram user id: message @userinfobot, or check the server log.
import "varlock/auto-load";

import { randomUUID } from "node:crypto";

import { createDb } from "@katip/db";
import type { AnyDatabase } from "@katip/db/repositories";
import { user } from "@katip/db/schema/auth";
import { linkChannelIdentity, TELEGRAM_CHANNEL } from "@katip/db/telegram";
import { eq } from "drizzle-orm";

import { ENV } from "../src/env";

async function main(): Promise<void> {
	if (ENV.NODE_ENV === "production" || process.env.NODE_ENV === "production") {
		console.error(
			"dev-link-telegram: refusing to run with NODE_ENV=production.",
		);
		process.exit(1);
	}

	const [email, telegramId] = process.argv.slice(2);
	if (!email || !telegramId || !/^\d+$/.test(telegramId)) {
		console.error(
			"Usage: npm run dev:link-telegram -- <email> <telegram-user-id>",
		);
		process.exit(1);
	}

	const db = createDb(ENV) as unknown as AnyDatabase;
	const [found] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	if (!found) {
		console.error(`No user with email ${email}. Sign in on the web first.`);
		process.exit(1);
	}

	await linkChannelIdentity(db, {
		id: randomUUID(),
		userId: found.id,
		channel: TELEGRAM_CHANNEL,
		externalId: telegramId,
		linkedAt: new Date(),
	});
	console.log(`Linked Telegram user ${telegramId} to ${email}.`);
	process.exit(0);
}

main().catch((error) => {
	console.error("dev-link-telegram failed:", error);
	process.exit(1);
});
