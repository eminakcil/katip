// Postgres implementations of the Telegram adapter's ports (structurally typed:
// this package does not import @katip/telegram).
import { and, eq } from "drizzle-orm";

import type { AnyDatabase } from "./repositories";
import { channelIdentities } from "./schema/core";
import { tgMessageLinks, tgProcessedUpdates } from "./schema/telegram";

/** Channel name stored in channel_identities for Telegram accounts. */
export const TELEGRAM_CHANNEL = "telegram";

export function createProcessedUpdates(db: AnyDatabase) {
	return {
		async claim(updateId: number): Promise<boolean> {
			const inserted = await db
				.insert(tgProcessedUpdates)
				.values({ updateId })
				.onConflictDoNothing()
				.returning({ updateId: tgProcessedUpdates.updateId });
			return inserted.length > 0;
		},
		async release(updateId: number): Promise<void> {
			await db
				.delete(tgProcessedUpdates)
				.where(eq(tgProcessedUpdates.updateId, updateId));
		},
	};
}

export function createIdentityLookup(db: AnyDatabase) {
	return {
		async findUserId(telegramUserId: number): Promise<string | null> {
			const [row] = await db
				.select({ userId: channelIdentities.userId })
				.from(channelIdentities)
				.where(
					and(
						eq(channelIdentities.channel, TELEGRAM_CHANNEL),
						eq(channelIdentities.externalId, String(telegramUserId)),
					),
				)
				.limit(1);
			return row?.userId ?? null;
		},
	};
}

export function createMessageLinks(db: AnyDatabase) {
	return {
		async save(link: {
			chatId: number;
			messageId: number;
			itemId: string;
		}): Promise<void> {
			await db.insert(tgMessageLinks).values(link);
		},
	};
}

/** Creates a channel identity row. Used by the dev linking script for now. */
export async function linkChannelIdentity(
	db: AnyDatabase,
	identity: typeof channelIdentities.$inferInsert,
): Promise<void> {
	await db.insert(channelIdentities).values(identity);
}
