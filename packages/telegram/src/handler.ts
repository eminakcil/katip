// Telegram update → core command → Turkish reply. Used by both the webhook
// (production) and long polling (dev), so behaviour is identical in both.
import type { UpdateHandlerDeps } from "./ports";
import { renderCaptureResult } from "./render";
import { strings } from "./strings";

/** Channel name passed to core; core treats it as an opaque string. */
export const TELEGRAM_CHANNEL = "telegram";

// Only the fields we read; the full shape is Telegram's Update object.
interface IncomingUpdate {
	update_id?: unknown;
	message?: {
		chat?: { id: number; type: string };
		from?: { id: number };
		text?: string;
	};
	callback_query?: { id: string };
}

export function createUpdateHandler(deps: UpdateHandlerDeps) {
	const { sender, processedUpdates } = deps;

	return async function handleUpdate(raw: unknown): Promise<void> {
		const update = raw as IncomingUpdate;
		if (typeof update?.update_id !== "number") return;

		const updateId = update.update_id;
		if (!(await processedUpdates.claim(updateId))) return;

		try {
			await dispatch(update, deps);
		} catch (error) {
			// Let Telegram's retry of this update be processed again.
			await processedUpdates.release(updateId);
			throw error;
		}
	};

	async function dispatch(
		update: IncomingUpdate,
		d: UpdateHandlerDeps,
	): Promise<void> {
		if (update.callback_query) {
			await sender.answerCallbackQuery(
				update.callback_query.id,
				strings.buttonComingSoon,
			);
			return;
		}

		const message = update.message;
		if (!message?.chat || !message.from || message.chat.type !== "private") {
			return;
		}

		const chatId = message.chat.id;
		const reply = (text: string) => sender.sendMessage(chatId, { text });
		const userId = await d.identities.findUserId(message.from.id);
		const text = message.text;

		if (!userId) {
			await reply(strings.notLinked(d.webAppUrl));
			return;
		}
		if (typeof text !== "string") {
			await reply(strings.onlyText);
			return;
		}
		if (text.startsWith("/")) {
			const command = text.slice(1).split(/[\s@]/)[0];
			await reply(
				command === "start" ? strings.welcome : strings.commandComingSoon,
			);
			return;
		}

		const result = await d.captureInput({
			userId,
			channel: TELEGRAM_CHANNEL,
			text,
		});
		const outgoing = renderCaptureResult(result, {
			now: d.clock.now(),
			webAppUrl: d.webAppUrl,
		});
		const { messageId } = await sender.sendMessage(chatId, outgoing);
		if (result.kind === "captured") {
			await d.messageLinks.save({ chatId, messageId, itemId: result.item.id });
		}
	}
}
