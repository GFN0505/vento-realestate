CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TYPE "public"."permission_action" AS ENUM('view', 'create', 'edit', 'delete', 'export', 'approve');--> statement-breakpoint
CREATE TYPE "public"."permission_module" AS ENUM('land', 'projects', 'sales', 'finance', 'facility', 'hr', 'compliance', 'documents', 'analytics', 'settings');--> statement-breakpoint
CREATE TYPE "public"."auth_attempt_kind" AS ENUM('password_failure', 'verification_email', 'password_reset_email');--> statement-breakpoint
CREATE TYPE "public"."sign_in_lock_reason" AS ENUM('password', 'two_step');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('holding', 'spv');--> statement-breakpoint
CREATE TABLE "invitation_entity_limits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "invitations_email_lower_case" CHECK ("invitations"."email" = lower("invitations"."email"))
);
--> statement-breakpoint
CREATE TABLE "member_entity_limits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "members_removed_consistent" CHECK (("members"."status" = 'removed') = ("members"."removed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"module" "permission_module" NOT NULL,
	"action" "permission_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"plural_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"requires_two_step" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"target_label" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"request_id" text,
	"ip_masked" text,
	"user_agent_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "auth_attempt_kind" NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_histories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_locks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"reason" "sign_in_lock_reason" NOT NULL,
	"locked_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organization_id" uuid,
	"persistent" boolean DEFAULT false NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"company_name" text,
	"terms_version" text,
	"terms_accepted_at" timestamp with time zone,
	"last_active_organization_id" uuid,
	"two_step_setup_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lower_case" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "entity_type" NOT NULL,
	"rc_number" text,
	"tin" text,
	"vat_registered" boolean DEFAULT false NOT NULL,
	"base_currency" char(3) DEFAULT 'NGN' NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "entities_base_currency_ngn" CHECK ("entities"."base_currency" = 'NGN'),
	CONSTRAINT "entities_archived_consistent" CHECK (("entities"."status" = 'archived') = ("entities"."archived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"head_office_state" text NOT NULL,
	"financial_year_start_month" smallint DEFAULT 1 NOT NULL,
	"base_currency" char(3) DEFAULT 'NGN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_length" CHECK (char_length("organizations"."name") between 2 and 120),
	CONSTRAINT "organizations_fy_month" CHECK ("organizations"."financial_year_start_month" between 1 and 12),
	CONSTRAINT "organizations_base_currency_ngn" CHECK ("organizations"."base_currency" = 'NGN')
);
--> statement-breakpoint
ALTER TABLE "invitation_entity_limits" ADD CONSTRAINT "invitation_entity_limits_invitation_fk" FOREIGN KEY ("organization_id","invitation_id") REFERENCES "public"."invitations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_entity_limits" ADD CONSTRAINT "invitation_entity_limits_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_fk" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_entity_limits" ADD CONSTRAINT "member_entity_limits_member_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "public"."members"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_entity_limits" ADD CONSTRAINT "member_entity_limits_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_role_fk" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fk" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_histories" ADD CONSTRAINT "password_histories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_in_locks" ADD CONSTRAINT "sign_in_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_organization_id_organizations_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_last_active_organization_id_organizations_id_fk" FOREIGN KEY ("last_active_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_entity_limits_unique" ON "invitation_entity_limits" USING btree ("invitation_id","entity_id");--> statement-breakpoint
CREATE INDEX "invitation_entity_limits_org_entity_idx" ON "invitation_entity_limits" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_org_email_pending_unique" ON "invitations" USING btree ("organization_id","email") WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitations_org_status_idx" ON "invitations" USING btree ("organization_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invitations_invited_by_idx" ON "invitations" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_entity_limits_unique" ON "member_entity_limits" USING btree ("member_id","entity_id");--> statement-breakpoint
CREATE INDEX "member_entity_limits_org_entity_idx" ON "member_entity_limits" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_user_active_unique" ON "members" USING btree ("organization_id","user_id") WHERE "members"."status" = 'active';--> statement-breakpoint
CREATE INDEX "members_user_id_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "members_org_status_idx" ON "members" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "members_org_role_idx" ON "members" USING btree ("organization_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_unique" ON "role_permissions" USING btree ("role_id","module","action");--> statement-breakpoint
CREATE INDEX "role_permissions_org_idx" ON "role_permissions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_key_unique" ON "roles" USING btree ("organization_id","key") WHERE "roles"."key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_name_unique" ON "roles" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "audit_events_org_created_idx" ON "audit_events" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_org_target_idx" ON "audit_events" USING btree ("organization_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_events_org_actor_idx" ON "audit_events" USING btree ("organization_id","actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auth_attempts_kind_subject_idx" ON "auth_attempts" USING btree ("kind","subject","created_at");--> statement-breakpoint
CREATE INDEX "password_histories_user_idx" ON "password_histories" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sign_in_locks_email_idx" ON "sign_in_locks" USING btree ("email","locked_until" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_unique" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_key_unique" ON "rate_limits" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_active_organization_id_idx" ON "sessions" USING btree ("active_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "two_factors_user_id_unique" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factors_secret_idx" ON "two_factors" USING btree ("secret");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_org_rc_unique" ON "entities" USING btree ("organization_id","rc_number") WHERE "entities"."rc_number" is not null;--> statement-breakpoint
CREATE INDEX "entities_org_status_idx" ON "entities" USING btree ("organization_id","status");