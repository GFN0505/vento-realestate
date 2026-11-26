CREATE TYPE "public"."invitation_delivery" AS ENUM('queued', 'sent', 'failed', 'bounced', 'complained');--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "delivery" "invitation_delivery" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "delivery_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "delivery_message_id" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "removed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "checklist_hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "checklist_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "members_removed_by_idx" ON "members" USING btree ("removed_by_user_id");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_removed_by_only_removed" CHECK ("members"."removed_by_user_id" is null or "members"."status" = 'removed');