// Composition root for the Telegram bot: wires core, adapters and infrastructure.
// Dev uses long polling (no tunnel); production uses the webhook with the secret
// token (CLAUDE.md, "Local bot testing").
import { randomUUID } from "node:crypto";

import { createCaptureInput, createListToday } from "@katip/core";
import { ensureQueues, PgBossJobScheduler } from "@katip/db/job-scheduler";
import {
	type AnyDatabase,
	createRepositories,
	DrizzleUnitOfWork,
} from "@katip/db/repositories";
import {
	createIdentityLookup,
	createMessageLinks,
	createProcessedUpdates,
} from "@katip/db/telegram";
import { OpenRouterInputParser } from "@katip/llm";
import {
	createBot,
	createGrammySender,
	createUpdateHandler,
	createWebhookApp,
	startPolling,
} from "@katip/telegram";
import type { Hono } from "hono";
import { PgBoss } from "pg-boss";

import { ENV } from "./env.server";
import { db } from "./services";

export const WEBHOOK_PATH = "/telegram/webhook";

const systemClock = { now: () => new Date() };
const logError = (error: unknown) => console.error("[telegram]", error);

export async function setupTelegram(app: Hono): Promise<void> {
	const token = ENV.TELEGRAM_BOT_TOKEN;
	if (!token) {
		console.log("[telegram] TELEGRAM_BOT_TOKEN is not set; bot disabled");
		return;
	}
	if (!ENV.OPENROUTER_API_KEY) {
		throw new Error("OPENROUTER_API_KEY is required when the bot is enabled");
	}
	if (ENV.NODE_ENV === "production" && ENV.TELEGRAM_MODE !== "webhook") {
		throw new Error("TELEGRAM_MODE must be 'webhook' in production");
	}

	const database = db as unknown as AnyDatabase;
	const boss = new PgBoss(ENV.DATABASE_URL);
	boss.on("error", (error) => console.error("[pg-boss]", error));
	await boss.start();
	await ensureQueues(boss);

	const captureInput = createCaptureInput({
		clock: systemClock,
		ids: { next: () => randomUUID() },
		parser: new OpenRouterInputParser({
			apiKey: ENV.OPENROUTER_API_KEY,
			model: ENV.LLM_MODEL,
		}),
		uow: new DrizzleUnitOfWork(database, (tx) =>
			PgBossJobScheduler.inTransaction(boss, tx),
		),
		repos: createRepositories(database),
	});

	const listToday = createListToday({
		clock: systemClock,
		repos: createRepositories(database),
	});

	const bot = createBot(token);
	const handleUpdate = createUpdateHandler({
		sender: createGrammySender(bot.api),
		processedUpdates: createProcessedUpdates(database),
		identities: createIdentityLookup(database),
		messageLinks: createMessageLinks(database),
		captureInput,
		listToday,
		clock: systemClock,
		webAppUrl: ENV.CORS_ORIGIN,
	});

	if (ENV.TELEGRAM_MODE === "webhook") {
		const secret = ENV.TELEGRAM_WEBHOOK_SECRET;
		if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is required");
		app.route(
			"/",
			createWebhookApp({
				path: WEBHOOK_PATH,
				secret,
				handleUpdate,
				onError: logError,
			}),
		);
		console.log(`[telegram] webhook mode on ${WEBHOOK_PATH}`);
	} else {
		await startPolling(bot, handleUpdate, logError);
		console.log("[telegram] long polling started (dev)");
	}
}
