CREATE TYPE "public"."account_kind" AS ENUM('customer', 'staff');--> statement-breakpoint
CREATE TYPE "public"."staff_invitation_status" AS ENUM('pending', 'accepted', 'expired', 'withdrawn');--> statement-breakpoint
ALTER TYPE "public"."platform_channel" ADD VALUE 'account';--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"reason" text NOT NULL,
	"invited_by_user_id" uuid,
	"bootstrap" boolean DEFAULT false NOT NULL,
	"status" "staff_invitation_status" DEFAULT 'pending' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"started_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"withdrawn_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitations_email_lower_case" CHECK ("staff_invitations"."email" = lower("staff_invitations"."email")),
	CONSTRAINT "staff_invitations_name_length" CHECK (char_length(btrim("staff_invitations"."name")) between 2 and 80),
	CONSTRAINT "staff_invitations_reason_length" CHECK (char_length("staff_invitations"."reason") between 3 and 500),
	CONSTRAINT "staff_invitations_started_with_user" CHECK (("staff_invitations"."user_id" is null) = ("staff_invitations"."started_at" is null)),
	CONSTRAINT "staff_invitations_accepted_has_user" CHECK ("staff_invitations"."status" <> 'accepted' or "staff_invitations"."user_id" is not null),
	CONSTRAINT "staff_invitations_responded" CHECK ("staff_invitations"."status" not in ('accepted', 'withdrawn') or "staff_invitations"."responded_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_kind" "account_kind" DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_withdrawn_by_user_id_users_id_fk" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_email_pending_unique" ON "staff_invitations" USING btree ("email") WHERE "staff_invitations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_token_hash_unique" ON "staff_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_invitations_status_idx" ON "staff_invitations" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "staff_invitations_user_idx" ON "staff_invitations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_invitations_invited_by_idx" ON "staff_invitations" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE INDEX "staff_invitations_withdrawn_by_idx" ON "staff_invitations" USING btree ("withdrawn_by_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_created_idx" ON "audit_events" USING btree ("action","created_at" DESC NULLS LAST);