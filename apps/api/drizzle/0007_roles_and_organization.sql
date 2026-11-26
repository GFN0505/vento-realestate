DROP INDEX "roles_org_name_unique";--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "single_company_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "single_company_confirmed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_single_company_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("single_company_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_archived_by_idx" ON "entities" USING btree ("archived_by_user_id");--> statement-breakpoint
CREATE INDEX "organizations_single_company_by_idx" ON "organizations" USING btree ("single_company_confirmed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_name_unique" ON "roles" USING btree ("organization_id",lower("name")) WHERE "roles"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_version_positive" CHECK ("roles"."version" >= 1);--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_system_key_consistent" CHECK (("roles"."key" is null) = (not "roles"."is_system"));--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_archived_custom_only" CHECK ("roles"."archived_at" is null or not "roles"."is_system");--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_archived_by_only_archived" CHECK ("entities"."archived_by_user_id" is null or "entities"."status" = 'archived');--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_single_company_consistent" CHECK (("organizations"."single_company_confirmed_at" is null) = ("organizations"."single_company_confirmed_by_user_id" is null));