CREATE TYPE "public"."override_kind" AS ENUM('release', 'feature', 'limit');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('super_admin');--> statement-breakpoint
CREATE TYPE "public"."release_group" AS ENUM('standard', 'pilot', 'internal');--> statement-breakpoint
CREATE TYPE "public"."release_stage" AS ENUM('off', 'internal', 'pilot', 'on');--> statement-breakpoint
CREATE TABLE "feature_releases" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"feature_key" text NOT NULL,
	"stage" "release_stage" NOT NULL,
	"reason" text NOT NULL,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_releases_key_shape" CHECK ("feature_releases"."feature_key" ~ '^[a-z_]+(\.[a-z_]+)?$'),
	CONSTRAINT "feature_releases_reason_length" CHECK (char_length("feature_releases"."reason") >= 3)
);
--> statement-breakpoint
CREATE TABLE "organization_add_ons" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"add_on_key" text NOT NULL,
	"limit_increases" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_add_ons_ends_after_start" CHECK ("organization_add_ons"."ends_at" is null or "organization_add_ons"."ends_at" > "organization_add_ons"."starts_at"),
	CONSTRAINT "organization_add_ons_increases_object" CHECK (jsonb_typeof("organization_add_ons"."limit_increases") = 'object'),
	CONSTRAINT "organization_add_ons_reason_length" CHECK (char_length("organization_add_ons"."reason") >= 3)
);
--> statement-breakpoint
CREATE TABLE "organization_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "override_kind" NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean,
	"limit_value" numeric(14, 2),
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"trial_id" uuid,
	"created_by_user_id" uuid,
	"cleared_at" timestamp with time zone,
	"cleared_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_overrides_enabled_by_kind" CHECK (("organization_overrides"."kind" in ('release', 'feature')) = ("organization_overrides"."enabled" is not null)),
	CONSTRAINT "organization_overrides_limit_value_by_kind" CHECK ("organization_overrides"."kind" = 'limit' or "organization_overrides"."limit_value" is null),
	CONSTRAINT "organization_overrides_limit_value_non_negative" CHECK ("organization_overrides"."limit_value" is null or "organization_overrides"."limit_value" >= 0),
	CONSTRAINT "organization_overrides_trial_expires" CHECK ("organization_overrides"."trial_id" is null or "organization_overrides"."expires_at" is not null),
	CONSTRAINT "organization_overrides_reason_length" CHECK (char_length("organization_overrides"."reason") >= 3)
);
--> statement-breakpoint
CREATE TABLE "organization_plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"release_group" "release_group" DEFAULT 'standard' NOT NULL,
	"plan_version_id" uuid,
	"plan_assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_plans_assigned_consistent" CHECK (("organization_plans"."plan_version_id" is null) = ("organization_plans"."plan_assigned_at" is null))
);
--> statement-breakpoint
CREATE TABLE "organization_trials" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_on" date NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"notified_seven_days_at" timestamp with time zone,
	"notified_one_day_at" timestamp with time zone,
	"ended_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_trials_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_trials_expires_after_start" CHECK ("organization_trials"."expires_at" > "organization_trials"."starts_at"),
	CONSTRAINT "organization_trials_reason_length" CHECK (char_length("organization_trials"."reason") >= 3)
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_versions_version_positive" CHECK ("plan_versions"."version" > 0),
	CONSTRAINT "plan_versions_limits_object" CHECK (jsonb_typeof("plan_versions"."limits") = 'object'),
	CONSTRAINT "plan_versions_features_no_nulls" CHECK (array_position("plan_versions"."features", null) is null)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"is_default_for_new" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "platform_role" DEFAULT 'super_admin' NOT NULL,
	"reason" text NOT NULL,
	"granted_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"operator" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_key" text,
	"organization_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feature_releases" ADD CONSTRAINT "feature_releases_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_add_ons" ADD CONSTRAINT "organization_add_ons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_add_ons" ADD CONSTRAINT "organization_add_ons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_add_ons" ADD CONSTRAINT "organization_add_ons_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_overrides" ADD CONSTRAINT "organization_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_overrides" ADD CONSTRAINT "organization_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_overrides" ADD CONSTRAINT "organization_overrides_cleared_by_user_id_users_id_fk" FOREIGN KEY ("cleared_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_overrides" ADD CONSTRAINT "organization_overrides_trial_fk" FOREIGN KEY ("organization_id","trial_id") REFERENCES "public"."organization_trials"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_plans" ADD CONSTRAINT "organization_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_plans" ADD CONSTRAINT "organization_plans_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_trials" ADD CONSTRAINT "organization_trials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_trials" ADD CONSTRAINT "organization_trials_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_trials" ADD CONSTRAINT "organization_trials_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_trials" ADD CONSTRAINT "organization_trials_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_events" ADD CONSTRAINT "platform_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_events" ADD CONSTRAINT "platform_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feature_releases_key_unique" ON "feature_releases" USING btree ("feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_add_ons_active_unique" ON "organization_add_ons" USING btree ("organization_id","add_on_key") WHERE "organization_add_ons"."cancelled_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_overrides_live_unique" ON "organization_overrides" USING btree ("organization_id","kind","key") WHERE "organization_overrides"."cleared_at" is null;--> statement-breakpoint
CREATE INDEX "organization_overrides_trial_idx" ON "organization_overrides" USING btree ("organization_id","trial_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_plans_org_unique" ON "organization_plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_plans_plan_version_idx" ON "organization_plans" USING btree ("plan_version_id");--> statement-breakpoint
CREATE INDEX "organization_trials_org_idx" ON "organization_trials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_trials_open_idx" ON "organization_trials" USING btree ("expires_at") WHERE "organization_trials"."cancelled_at" is null and "organization_trials"."ended_recorded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_plan_version_unique" ON "plan_versions" USING btree ("plan_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_key_unique" ON "plans" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_sort_order_unique" ON "plans" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_one_default" ON "plans" USING btree ("is_default_for_new") WHERE "plans"."is_default_for_new" and "plans"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admins_user_active_unique" ON "platform_admins" USING btree ("user_id") WHERE "platform_admins"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "platform_audit_events_created_idx" ON "platform_audit_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "platform_audit_events_org_idx" ON "platform_audit_events" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "platform_audit_events_target_idx" ON "platform_audit_events" USING btree ("target_type","target_key","created_at" DESC NULLS LAST);