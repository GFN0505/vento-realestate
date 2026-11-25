DROP TABLE "rate_limits" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_required" boolean DEFAULT false NOT NULL;