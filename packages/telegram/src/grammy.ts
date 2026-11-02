// grammY glue: the real TelegramSender, and long polling for local development.
import type { Api, Bot } from "grammy";

import type { TelegramSender } from "./ports";
import { strings } from "./strings";

export function createGrammySender(api: Api): TelegramSender {
	return {
		async sendMessage(chatId, message) {
			const sent = await api.sendMessage(
				chatId,
				message.text,
				message.buttons
					? {
							reply_markup: {
								inline_keyboard: message.buttons.map((row) =>
									row.map((b) => ({
										text: b.text,
										callback_data: b.callbackData,
									})),
								),
							},
						}
					: undefined,
			);
			return { messageId: sent.message_id };
		},
		async answerCallbackQuery(callbackQueryId, text) {
			await api.answerCallbackQuery(
				callbackQueryId,
				text ? { text } : undefined,
			);
		},
	};
}

/** Registers the Turkish command menu shown in Telegram clients. */
export async function setBotCommands(api: Api): Promise<void> {
	await api.setMyCommands(strings.commands.map((c) => ({ ...c })));
}

/**
 * Dev only: receive updates by long polling, so no public URL or tunnel is
 * needed. Removes any registered webhook first (Telegram allows one or the other).
 */
export async function startPolling(
	bot: Bot,
	handleUpdate: (update: unknown) => Promise<void>,
	onError: (error: unknown) => void,
): Promise<void> {
	bot.use(async (ctx) => {
		await handleUpdate(ctx.update);
	});
	bot.catch((error) => onError(error.error));
	await bot.api.deleteWebhook();
	void bot.start({ allowed_updates: ["message", "callback_query"] });
}

/** Production: point Telegram at our webhook with the secret token. */
export async function registerWebhook(
	api: Api,
	url: string,
	secretToken: string,
): Promise<void> {
	await api.setWebhook(url, {
		secret_token: secretToken,
		allowed_updates: ["message", "callback_query"],
	});
}
