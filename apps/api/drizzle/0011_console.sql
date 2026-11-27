CREATE TYPE "public"."platform_channel" AS ENUM('console', 'command', 'scheduled');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "second_factor_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "console_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "console_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "last_console_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_audit_events" ADD COLUMN "channel" "platform_channel";--> statement-breakpoint
ALTER TABLE "platform_audit_events" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
CREATE INDEX "platform_audit_events_actor_idx" ON "platform_audit_events" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "platform_audit_events_idempotency_unique" ON "platform_audit_events" USING btree ("idempotency_key") WHERE "platform_audit_events"."idempotency_key" is not null;--> statement-breakpoint
ALTER TABLE "platform_audit_events" ADD CONSTRAINT "platform_audit_events_console_actor" CHECK ("platform_audit_events"."channel" is distinct from 'console' or "platform_audit_events"."actor_user_id" is not null);