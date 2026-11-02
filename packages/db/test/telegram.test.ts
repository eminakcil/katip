// Postgres implementations of the Telegram adapter's ports.
import { beforeEach, describe, expect, it } from "vitest";

import type { AnyDatabase } from "../src/repositories";
import { inputs, items } from "../src/schema/core";
import { tgMessageLinks } from "../src/schema/telegram";
import {
	createIdentityLookup,
	createMessageLinks,
	createProcessedUpdates,
	linkChannelIdentity,
} from "../src/telegram";
import { createTestDb, insertUser } from "./pglite";

const T0 = new Date("2026-11-06T09:00:00.000Z");
const ITEM_ID = "00000000-0000-4000-8000-000000000010";

let db: AnyDatabase;

beforeEach(async () => {
	db = await createTestDb();
	await insertUser(db, "u1");
});

describe("processed updates", () => {
	it("claims an update id once", async () => {
		const updates = createProcessedUpdates(db);

		expect(await updates.claim(1001)).toBe(true);
		expect(await updates.claim(1001)).toBe(false);
		expect(await updates.claim(1002)).toBe(true);
	});

	it("can claim again after a release", async () => {
		const updates = createProcessedUpdates(db);
		await updates.claim(1003);
		await updates.release(1003);

		expect(await updates.claim(1003)).toBe(true);
	});
});

describe("identity lookup", () => {
	it("maps a linked Telegram user id to the internal user id", async () => {
		await linkChannelIdentity(db, {
			id: "00000000-0000-4000-8000-000000000040",
			userId: "u1",
			channel: "telegram",
			externalId: "42",
			linkedAt: T0,
		});
		const identities = createIdentityLookup(db);

		expect(await identities.findUserId(42)).toBe("u1");
		expect(await identities.findUserId(43)).toBeNull();
	});

	it("only matches the telegram channel", async () => {
		await linkChannelIdentity(db, {
			id: "00000000-0000-4000-8000-000000000041",
			userId: "u1",
			channel: "other",
			externalId: "42",
			linkedAt: T0,
		});

		expect(await createIdentityLookup(db).findUserId(42)).toBeNull();
	});
});

describe("message links", () => {
	it("stores the bot message to item mapping", async () => {
		await db.insert(inputs).values({
			id: "00000000-0000-4000-8000-000000000001",
			userId: "u1",
			channel: "telegram",
			kind: "text",
			createdAt: T0,
		});
		await db.insert(items).values({
			id: ITEM_ID,
			ownerId: "u1",
			createdBy: "u1",
			type: "note",
			title: "x",
			scope: "other",
			priority: "normal",
			status: "open",
			createdAt: T0,
		});

		await createMessageLinks(db).save({
			chatId: 42,
			messageId: 500,
			itemId: ITEM_ID,
		});

		const rows = await db.select().from(tgMessageLinks);
		expect(rows).toMatchObject([
			{ chatId: 42, messageId: 500, itemId: ITEM_ID },
		]);
	});
});
