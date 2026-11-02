// Telegram adapter (ADR 0002). Maps Telegram updates to core commands and
// renders core results as Turkish messages. Core never imports this package.
import { Bot } from "grammy";

export function createBot(token: string): Bot {
	return new Bot(token);
}

export {
	createGrammySender,
	registerWebhook,
	setBotCommands,
	startPolling,
} from "./grammy";
export { createUpdateHandler, TELEGRAM_CHANNEL } from "./handler";
export type * from "./ports";
export { renderCaptureResult } from "./render";
export { strings } from "./strings";
export { createWebhookApp, isValidSecretToken, SECRET_HEADER } from "./webhook";
