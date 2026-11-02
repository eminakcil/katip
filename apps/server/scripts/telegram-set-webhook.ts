// Registers the production webhook (with its secret token) and the Turkish
// command menu. Run once per deploy or when the URL/secret changes:
//   npm run telegram:set-webhook   (from apps/server, with production env)
// The webhook URL is <BETTER_AUTH_URL>/telegram/webhook (the server's public URL).
import "varlock/auto-load";

import { createBot, registerWebhook, setBotCommands } from "@katip/telegram";

import { ENV } from "../src/env";

const WEBHOOK_PATH = "/telegram/webhook";

async function main(): Promise<void> {
	const token = ENV.TELEGRAM_BOT_TOKEN;
	const secret = ENV.TELEGRAM_WEBHOOK_SECRET;
	if (!token || !secret) {
		console.error(
			"TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required.",
		);
		process.exit(1);
	}
	const url = new URL(WEBHOOK_PATH, ENV.BETTER_AUTH_URL).toString();
	const bot = createBot(token);
	await registerWebhook(bot.api, url, secret);
	await setBotCommands(bot.api);
	console.log(`Webhook registered: ${url}`);
}

main().catch((error) => {
	console.error("telegram-set-webhook failed:", error);
	process.exit(1);
});
