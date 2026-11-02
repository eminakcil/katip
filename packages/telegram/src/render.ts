// Core CaptureInput results → Turkish Telegram messages.
import type { CaptureInputResult, Item, Reminder } from "@katip/core";

import {
	formatDateTr,
	formatTimeTr,
	localDayKey,
	withLocative,
} from "./format";
import type { InlineButton, OutgoingMessage } from "./ports";
import { strings } from "./strings";

export interface RenderContext {
	now: Date;
	webAppUrl: string;
}

export function renderCaptureResult(
	result: CaptureInputResult,
	ctx: RenderContext,
): OutgoingMessage {
	switch (result.kind) {
		case "captured":
			return {
				text: confirmationText(
					result.item,
					result.reminders,
					result.timezone,
					ctx.now,
				),
				buttons: itemButtons(result.item.id),
			};
		case "needs_clarification":
			return { text: strings.needsClarification };
		case "parser_unavailable":
			return { text: strings.parserUnavailable };
		case "unsupported_type":
			return { text: strings.unsupportedType };
		case "unknown_user":
			return { text: strings.notLinked(ctx.webAppUrl) };
	}
}

function confirmationText(
	item: Item,
	reminders: Reminder[],
	timezone: string,
	now: Date,
): string {
	const at = item.startsAt ?? item.dueAt;
	if (!at) {
		return `${strings.confirmNote(item.title)} ${strings.replyHint}`;
	}

	const date = formatDateTr(at, timezone);
	const when = item.allDay ? date : `${date} ${formatTimeTr(at, timezone)}`;
	const sentences = [strings.confirmDated(item.title, when)];

	const itemDay = localDayKey(at, timezone);
	const onFutureDay = itemDay > localDayKey(now, timezone);
	const reminderWhen = reminders
		.map((reminder) => {
			const time = withLocative(formatTimeTr(reminder.fireAt, timezone));
			return localDayKey(reminder.fireAt, timezone) === itemDay
				? time
				: `${formatDateTr(reminder.fireAt, timezone)} ${time}`;
		})
		.join(" ve ");

	if (onFutureDay && reminderWhen) {
		sentences.push(strings.morningListAndReminder(reminderWhen));
	} else if (onFutureDay) {
		sentences.push(strings.morningListOnly);
	} else if (reminderWhen) {
		sentences.push(strings.reminderOnly(reminderWhen));
	}
	sentences.push(strings.replyHint);
	return sentences.join(" ");
}

function itemButtons(itemId: string): InlineButton[][] {
	return [
		[
			{ text: strings.buttons.edit, callbackData: `edit:${itemId}` },
			{ text: strings.buttons.changeTime, callbackData: `time:${itemId}` },
			{ text: strings.buttons.delete, callbackData: `del:${itemId}` },
		],
	];
}
