ALTER TABLE "two_factors" ADD COLUMN "last_totp_step" integer;--> statement-breakpoint
ALTER TABLE "two_factors" ADD COLUMN "backup_codes_unproven_at" timestamp with time zone;