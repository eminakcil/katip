CREATE TYPE "input_kind" AS ENUM('text', 'audio');--> statement-breakpoint
CREATE TYPE "item_priority" AS ENUM('normal', 'high');--> statement-breakpoint
CREATE TYPE "item_scope" AS ENUM('personal', 'work', 'other');--> statement-breakpoint
CREATE TYPE "item_status" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "item_type" AS ENUM('event', 'task', 'reminder', 'recurring', 'annual', 'note');--> statement-breakpoint
CREATE TYPE "link_direction" AS ENUM('web', 'bot');--> statement-breakpoint
CREATE TYPE "reminder_status" AS ENUM('pending', 'sent', 'cancelled');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"timezone" text DEFAULT 'Europe/Istanbul' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_identities" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "channel_identities_channel_external_id_unique" UNIQUE("channel","external_id")
);
--> statement-breakpoint
CREATE TABLE "inputs" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"kind" "input_kind" NOT NULL,
	"raw_text" text,
	"transcript" text,
	"parse_result" jsonb,
	"parse_valid" boolean,
	"model_version" text,
	"corrected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_events" (
	"id" uuid PRIMARY KEY,
	"item_id" uuid NOT NULL,
	"event" text NOT NULL,
	"data" jsonb,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY,
	"owner_id" text NOT NULL,
	"created_by" text NOT NULL,
	"type" "item_type" NOT NULL,
	"title" text NOT NULL,
	"scope" "item_scope" NOT NULL,
	"priority" "item_priority" NOT NULL,
	"status" "item_status" NOT NULL,
	"starts_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"source_input_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_tokens" (
	"id" uuid PRIMARY KEY,
	"token_hash" text NOT NULL UNIQUE,
	"direction" "link_direction" NOT NULL,
	"user_id" text,
	"channel" text,
	"external_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY,
	"item_id" uuid NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"status" "reminder_status" NOT NULL,
	"sent_at" timestamp with time zone,
	"job_id" text
);
--> statement-breakpoint
CREATE TABLE "tg_message_links" (
	"chat_id" bigint,
	"message_id" bigint,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tg_message_links_pkey" PRIMARY KEY("chat_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "tg_processed_updates" (
	"update_id" bigint PRIMARY KEY,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "channel_identities_user_id_idx" ON "channel_identities" ("user_id");--> statement-breakpoint
CREATE INDEX "inputs_user_id_created_at_idx" ON "inputs" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "item_events_item_id_at_idx" ON "item_events" ("item_id","at");--> statement-breakpoint
CREATE INDEX "items_owner_id_starts_at_idx" ON "items" ("owner_id","starts_at");--> statement-breakpoint
CREATE INDEX "items_owner_id_due_at_idx" ON "items" ("owner_id","due_at");--> statement-breakpoint
CREATE INDEX "link_tokens_user_id_idx" ON "link_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_item_id_idx" ON "reminders" ("item_id");--> statement-breakpoint
CREATE INDEX "reminders_status_fire_at_idx" ON "reminders" ("status","fire_at");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inputs" ADD CONSTRAINT "inputs_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_source_input_id_inputs_id_fkey" FOREIGN KEY ("source_input_id") REFERENCES "inputs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "link_tokens" ADD CONSTRAINT "link_tokens_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tg_message_links" ADD CONSTRAINT "tg_message_links_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;