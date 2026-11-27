CREATE TYPE "public"."approval_decision" AS ENUM('approve', 'reject');--> statement-breakpoint
CREATE TYPE "public"."approval_ended_reason" AS ENUM('timeout', 'stale', 'maker_left', 'maker');--> statement-breakpoint
CREATE TYPE "public"."approval_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_name" text NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_decisions_position_range" CHECK ("approval_decisions"."position" between 1 and 3),
	CONSTRAINT "approval_decisions_reject_has_comment" CHECK ("approval_decisions"."decision" = 'approve' or coalesce(btrim("approval_decisions"."comment"), '') <> '')
);
--> statement-breakpoint
CREATE TABLE "approval_request_step_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_request_step_roles_position_range" CHECK ("approval_request_step_roles"."position" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action_key" text NOT NULL,
	"module" "permission_module" NOT NULL,
	"entity_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"reason" text NOT NULL,
	"maker_member_id" uuid NOT NULL,
	"maker_user_id" uuid NOT NULL,
	"maker_name" text NOT NULL,
	"status" "approval_request_status" DEFAULT 'pending' NOT NULL,
	"ended_reason" "approval_ended_reason",
	"current_step" smallint DEFAULT 1 NOT NULL,
	"step_count" smallint NOT NULL,
	"rule_id" uuid,
	"policy" text NOT NULL,
	"excluded_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amount" numeric(14, 2),
	"currency" char(3),
	"ngn_amount" numeric(14, 2),
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_requests_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "approval_requests_step_count_range" CHECK ("approval_requests"."step_count" between 1 and 3),
	CONSTRAINT "approval_requests_current_step_range" CHECK ("approval_requests"."current_step" between 1 and "approval_requests"."step_count"),
	CONSTRAINT "approval_requests_ended_reason_consistent" CHECK ("approval_requests"."ended_reason" is null or "approval_requests"."status" in ('cancelled', 'expired')),
	CONSTRAINT "approval_requests_decided_consistent" CHECK (("approval_requests"."status" = 'pending') = ("approval_requests"."decided_at" is null)),
	CONSTRAINT "approval_requests_amount_consistent" CHECK (("approval_requests"."amount" is null) = ("approval_requests"."currency" is null) and ("approval_requests"."amount" is null) = ("approval_requests"."ngn_amount" is null))
);
--> statement-breakpoint
CREATE TABLE "approval_rule_entities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_rule_step_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_rule_steps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_rule_steps_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "approval_rule_steps_position_range" CHECK ("approval_rule_steps"."position" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action_key" text NOT NULL,
	"min_amount" numeric(14, 2),
	"applies_to_all" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_rules_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "approval_rules_min_amount_positive" CHECK ("approval_rules"."min_amount" is null or "approval_rules"."min_amount" > 0),
	CONSTRAINT "approval_rules_version_positive" CHECK ("approval_rules"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_request_fk" FOREIGN KEY ("organization_id","request_id") REFERENCES "public"."approval_requests"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_member_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request_step_roles" ADD CONSTRAINT "approval_request_step_roles_request_fk" FOREIGN KEY ("organization_id","request_id") REFERENCES "public"."approval_requests"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request_step_roles" ADD CONSTRAINT "approval_request_step_roles_role_fk" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_maker_user_id_users_id_fk" FOREIGN KEY ("maker_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_maker_fk" FOREIGN KEY ("organization_id","maker_member_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule_entities" ADD CONSTRAINT "approval_rule_entities_rule_fk" FOREIGN KEY ("organization_id","rule_id") REFERENCES "public"."approval_rules"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule_entities" ADD CONSTRAINT "approval_rule_entities_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule_step_roles" ADD CONSTRAINT "approval_rule_step_roles_step_fk" FOREIGN KEY ("organization_id","step_id") REFERENCES "public"."approval_rule_steps"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule_step_roles" ADD CONSTRAINT "approval_rule_step_roles_role_fk" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule_steps" ADD CONSTRAINT "approval_rule_steps_rule_fk" FOREIGN KEY ("organization_id","rule_id") REFERENCES "public"."approval_rules"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_created_by_fk" FOREIGN KEY ("organization_id","created_by_member_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_decisions_position_unique" ON "approval_decisions" USING btree ("request_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_decisions_user_unique" ON "approval_decisions" USING btree ("request_id","user_id");--> statement-breakpoint
CREATE INDEX "approval_decisions_org_user_created_idx" ON "approval_decisions" USING btree ("organization_id","user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "approval_decisions_org_member_idx" ON "approval_decisions" USING btree ("organization_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_request_step_roles_unique" ON "approval_request_step_roles" USING btree ("request_id","position","role_id");--> statement-breakpoint
CREATE INDEX "approval_request_step_roles_org_role_idx" ON "approval_request_step_roles" USING btree ("organization_id","role_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_pending_subject_unique" ON "approval_requests" USING btree ("organization_id","action_key","subject_type","subject_id") WHERE "approval_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "approval_requests_org_status_created_idx" ON "approval_requests" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "approval_requests_org_maker_created_idx" ON "approval_requests" USING btree ("organization_id","maker_member_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "approval_requests_pending_expires_idx" ON "approval_requests" USING btree ("expires_at") WHERE "approval_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "approval_requests_maker_user_idx" ON "approval_requests" USING btree ("maker_user_id");--> statement-breakpoint
CREATE INDEX "approval_requests_org_entity_idx" ON "approval_requests" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_rule_entities_unique" ON "approval_rule_entities" USING btree ("rule_id","entity_id");--> statement-breakpoint
CREATE INDEX "approval_rule_entities_org_entity_idx" ON "approval_rule_entities" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_rule_step_roles_unique" ON "approval_rule_step_roles" USING btree ("step_id","role_id");--> statement-breakpoint
CREATE INDEX "approval_rule_step_roles_org_role_idx" ON "approval_rule_step_roles" USING btree ("organization_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_rule_steps_position_unique" ON "approval_rule_steps" USING btree ("rule_id","position");--> statement-breakpoint
CREATE INDEX "approval_rule_steps_org_idx" ON "approval_rule_steps" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_rules_all_scope_unique" ON "approval_rules" USING btree ("organization_id","action_key",coalesce("min_amount", 0)) WHERE "approval_rules"."applies_to_all";--> statement-breakpoint
CREATE INDEX "approval_rules_org_action_idx" ON "approval_rules" USING btree ("organization_id","action_key");--> statement-breakpoint
CREATE INDEX "approval_rules_created_by_idx" ON "approval_rules" USING btree ("organization_id","created_by_member_id");