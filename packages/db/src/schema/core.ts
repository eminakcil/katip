// Core-owned tables (docs/project-brief.md, "Data model").
// All instants are timestamptz in UTC; the user's timezone lives on `user`.
import type { ParseAttempt } from "@katip/core";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

const instant = (name: string) =>
	timestamp(name, { withTimezone: true, mode: "date" });

export const itemType = pgEnum("item_type", [
	"event",
	"task",
	"reminder",
	"recurring",
	"annual",
	"note",
]);
export const itemScope = pgEnum("item_scope", ["personal", "work", "other"]);
export const itemPriority = pgEnum("item_priority", ["normal", "high"]);
export const itemStatus = pgEnum("item_status", ["open", "done", "cancelled"]);
export const reminderStatus = pgEnum("reminder_status", [
	"pending",
	"sent",
	"cancelled",
]);
export const inputKind = pgEnum("input_kind", ["text", "audio"]);
export const linkDirection = pgEnum("link_direction", ["web", "bot"]);

export const channelIdentities = pgTable(
	"channel_identities",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		channel: text("channel").notNull(),
		externalId: text("external_id").notNull(),
		linkedAt: instant("linked_at").notNull(),
	},
	(t) => [
		// One external account links to at most one user.
		unique("channel_identities_channel_external_id_unique").on(
			t.channel,
			t.externalId,
		),
		index("channel_identities_user_id_idx").on(t.userId),
	],
);

export const linkTokens = pgTable(
	"link_tokens",
	{
		id: uuid("id").primaryKey(),
		tokenHash: text("token_hash").notNull().unique(),
		direction: linkDirection("direction").notNull(),
		/** Set for web-initiated tokens. */
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		/** Set for bot-initiated codes (the requesting channel identity). */
		channel: text("channel"),
		externalId: text("external_id"),
		attempts: integer("attempts").default(0).notNull(),
		expiresAt: instant("expires_at").notNull(),
		usedAt: instant("used_at"),
		createdAt: instant("created_at").defaultNow().notNull(),
	},
	(t) => [index("link_tokens_user_id_idx").on(t.userId)],
);

export const inputs = pgTable(
	"inputs",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		channel: text("channel").notNull(),
		kind: inputKind("kind").notNull(),
		rawText: text("raw_text"),
		transcript: text("transcript"),
		/** Last raw parser output, valid or not (eval dataset). */
		parseResult: jsonb("parse_result"),
		parseValid: boolean("parse_valid"),
		/** Every parser attempt in order, including invalid and failed ones. */
		parseAttempts: jsonb("parse_attempts")
			.$type<ParseAttempt[]>()
			.default([])
			.notNull(),
		modelVersion: text("model_version"),
		corrected: boolean("corrected").default(false).notNull(),
		createdAt: instant("created_at").notNull(),
	},
	(t) => [index("inputs_user_id_created_at_idx").on(t.userId, t.createdAt)],
);

export const items = pgTable(
	"items",
	{
		id: uuid("id").primaryKey(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: itemType("type").notNull(),
		title: text("title").notNull(),
		scope: itemScope("scope").notNull(),
		priority: itemPriority("priority").notNull(),
		status: itemStatus("status").notNull(),
		startsAt: instant("starts_at"),
		dueAt: instant("due_at"),
		allDay: boolean("all_day").default(false).notNull(),
		sourceInputId: uuid("source_input_id").references(() => inputs.id, {
			onDelete: "set null",
		}),
		createdAt: instant("created_at").notNull(),
	},
	(t) => [
		index("items_owner_id_starts_at_idx").on(t.ownerId, t.startsAt),
		index("items_owner_id_due_at_idx").on(t.ownerId, t.dueAt),
	],
);

export const itemEvents = pgTable(
	"item_events",
	{
		id: uuid("id").primaryKey(),
		itemId: uuid("item_id")
			.notNull()
			.references(() => items.id, { onDelete: "cascade" }),
		event: text("event").notNull(),
		data: jsonb("data"),
		at: instant("at").notNull(),
	},
	(t) => [index("item_events_item_id_at_idx").on(t.itemId, t.at)],
);

export const reminders = pgTable(
	"reminders",
	{
		id: uuid("id").primaryKey(),
		itemId: uuid("item_id")
			.notNull()
			.references(() => items.id, { onDelete: "cascade" }),
		fireAt: instant("fire_at").notNull(),
		status: reminderStatus("status").notNull(),
		sentAt: instant("sent_at"),
		/** pg-boss job id of the current occurrence, for cancellation (ADR 0008). */
		jobId: text("job_id"),
	},
	(t) => [
		index("reminders_item_id_idx").on(t.itemId),
		index("reminders_status_fire_at_idx").on(t.status, t.fireAt),
	],
);
