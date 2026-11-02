// Telegram-adapter-owned tables (ADR 0002). Core never reads these.
import {
	bigint,
	pgTable,
	primaryKey,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { items } from "./core";

/** Bot message ↔ item, for reply-to-add-detail. */
export const tgMessageLinks = pgTable(
	"tg_message_links",
	{
		chatId: bigint("chat_id", { mode: "number" }).notNull(),
		messageId: bigint("message_id", { mode: "number" }).notNull(),
		itemId: uuid("item_id")
			.notNull()
			.references(() => items.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
	},
	(t) => [primaryKey({ columns: [t.chatId, t.messageId] })],
);

/** Processed update ids, for webhook idempotency. */
export const tgProcessedUpdates = pgTable("tg_processed_updates", {
	updateId: bigint("update_id", { mode: "number" }).primaryKey(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" })
		.defaultNow()
		.notNull(),
});
