CREATE TYPE "public"."parcel_size_unit" AS ENUM('ha', 'sqm', 'plots');--> statement-breakpoint
CREATE TYPE "public"."parcel_status" AS ENUM('prospect', 'under_acquisition', 'acquired', 'titled', 'in_development', 'sold_out');--> statement-breakpoint
CREATE TYPE "public"."title_document_type" AS ENUM('survey_plan', 'excision_gazette', 'r_of_o', 'c_of_o', 'deed_of_assignment', 'governors_consent', 'family_receipt', 'land_purchase_agreement', 'other');--> statement-breakpoint
CREATE TYPE "public"."title_stage_status" AS ENUM('not_started', 'in_progress', 'submitted', 'queried', 'granted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."title_stage_type" AS ENUM('survey_plan', 'excision_gazette', 'r_of_o', 'c_of_o', 'deed_of_assignment', 'governors_consent');--> statement-breakpoint
CREATE TABLE "record_counters" (
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"last_value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_counters_pk" PRIMARY KEY("organization_id","kind"),
	CONSTRAINT "record_counters_positive" CHECK ("record_counters"."last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference_number" integer NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"lga" text NOT NULL,
	"area" text,
	"size_sqm" numeric(14, 2) NOT NULL,
	"size_unit" "parcel_size_unit" NOT NULL,
	"size_entered" numeric(14, 4) NOT NULL,
	"plot_size_sqm" numeric(10, 2),
	"status" "parcel_status" DEFAULT 'under_acquisition' NOT NULL,
	"acquired_on" date,
	"acquisition_cost" numeric(14, 2),
	"acquisition_currency" char(3) DEFAULT 'NGN' NOT NULL,
	"seller" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parcels_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "parcels_org_reference_unique" UNIQUE("organization_id","reference_number"),
	CONSTRAINT "parcels_reference_positive" CHECK ("parcels"."reference_number" > 0),
	CONSTRAINT "parcels_name_length" CHECK (char_length("parcels"."name") between 2 and 120),
	CONSTRAINT "parcels_size_positive" CHECK ("parcels"."size_sqm" > 0 and "parcels"."size_entered" > 0),
	CONSTRAINT "parcels_plot_size" CHECK (("parcels"."size_unit" = 'plots') = ("parcels"."plot_size_sqm" is not null) and ("parcels"."plot_size_sqm" is null or "parcels"."plot_size_sqm" > 0)),
	CONSTRAINT "parcels_cost_not_negative" CHECK ("parcels"."acquisition_cost" is null or "parcels"."acquisition_cost" >= 0),
	CONSTRAINT "parcels_cost_ngn" CHECK ("parcels"."acquisition_currency" = 'NGN'),
	CONSTRAINT "parcels_version_positive" CHECK ("parcels"."version" >= 1),
	CONSTRAINT "parcels_archived_by_only_archived" CHECK ("parcels"."archived_by_user_id" is null or "parcels"."archived_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "title_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"file_id" uuid NOT NULL,
	"number" text,
	"issued_on" date,
	"issued_by" text,
	"note" text,
	"uploaded_by_user_id" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" uuid,
	"removed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_document_versions_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "title_document_versions_document_no_unique" UNIQUE("document_id","version_no"),
	CONSTRAINT "title_document_versions_file_unique" UNIQUE("file_id"),
	CONSTRAINT "title_document_versions_no_positive" CHECK ("title_document_versions"."version_no" >= 1),
	CONSTRAINT "title_document_versions_removed_consistent" CHECK (("title_document_versions"."removed_at" is null and "title_document_versions"."removed_by_user_id" is null and "title_document_versions"."removed_reason" is null) or ("title_document_versions"."removed_at" is not null and "title_document_versions"."removed_by_user_id" is not null and char_length("title_document_versions"."removed_reason") between 3 and 300))
);
--> statement-breakpoint
CREATE TABLE "title_documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"parcel_id" uuid NOT NULL,
	"type" "title_document_type" NOT NULL,
	"name" text,
	"stage_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_documents_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "title_documents_other_named" CHECK ("title_documents"."type" <> 'other' or "title_documents"."name" is not null),
	CONSTRAINT "title_documents_single_unnamed" CHECK ("title_documents"."type" in ('family_receipt', 'land_purchase_agreement', 'deed_of_assignment', 'other') or "title_documents"."name" is null),
	CONSTRAINT "title_documents_name_length" CHECK ("title_documents"."name" is null or char_length("title_documents"."name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "title_stages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"parcel_id" uuid NOT NULL,
	"type" "title_stage_type" NOT NULL,
	"status" "title_stage_status" DEFAULT 'not_started' NOT NULL,
	"status_on" date,
	"reference" text,
	"issued_by" text,
	"note" text,
	"follow_up_on" date,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_stages_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "title_stages_org_parcel_id_unique" UNIQUE("organization_id","parcel_id","id"),
	CONSTRAINT "title_stages_parcel_type_unique" UNIQUE("parcel_id","type"),
	CONSTRAINT "title_stages_not_started_undated" CHECK ("title_stages"."status" <> 'not_started' or "title_stages"."status_on" is null),
	CONSTRAINT "title_stages_note_required" CHECK ("title_stages"."status" not in ('queried', 'rejected') or "title_stages"."note" is not null),
	CONSTRAINT "title_stages_follow_up_status" CHECK ("title_stages"."follow_up_on" is null or "title_stages"."status" in ('submitted', 'queried')),
	CONSTRAINT "title_stages_version_positive" CHECK ("title_stages"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "record_counters" ADD CONSTRAINT "record_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_entity_fk" FOREIGN KEY ("organization_id","entity_id") REFERENCES "public"."entities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_document_versions" ADD CONSTRAINT "title_document_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_document_versions" ADD CONSTRAINT "title_document_versions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_document_versions" ADD CONSTRAINT "title_document_versions_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_document_versions" ADD CONSTRAINT "title_document_versions_document_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."title_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_document_versions" ADD CONSTRAINT "title_document_versions_file_fk" FOREIGN KEY ("organization_id","file_id") REFERENCES "public"."files"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_documents" ADD CONSTRAINT "title_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_documents" ADD CONSTRAINT "title_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_documents" ADD CONSTRAINT "title_documents_parcel_fk" FOREIGN KEY ("organization_id","parcel_id") REFERENCES "public"."parcels"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_documents" ADD CONSTRAINT "title_documents_stage_fk" FOREIGN KEY ("organization_id","parcel_id","stage_id") REFERENCES "public"."title_stages"("organization_id","parcel_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_stages" ADD CONSTRAINT "title_stages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_stages" ADD CONSTRAINT "title_stages_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_stages" ADD CONSTRAINT "title_stages_parcel_fk" FOREIGN KEY ("organization_id","parcel_id") REFERENCES "public"."parcels"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parcels_org_entity_idx" ON "parcels" USING btree ("organization_id","entity_id");--> statement-breakpoint
CREATE INDEX "parcels_org_status_idx" ON "parcels" USING btree ("organization_id","status") WHERE "parcels"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "parcels_org_name_idx" ON "parcels" USING btree ("organization_id",lower("name")) WHERE "parcels"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "parcels_org_updated_idx" ON "parcels" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "parcels_archived_by_idx" ON "parcels" USING btree ("archived_by_user_id");--> statement-breakpoint
CREATE INDEX "title_document_versions_org_document_idx" ON "title_document_versions" USING btree ("organization_id","document_id");--> statement-breakpoint
CREATE INDEX "title_document_versions_uploaded_by_idx" ON "title_document_versions" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "title_document_versions_removed_by_idx" ON "title_document_versions" USING btree ("removed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "title_documents_parcel_type_name_unique" ON "title_documents" USING btree ("organization_id","parcel_id","type",lower(coalesce("name", '')));--> statement-breakpoint
CREATE INDEX "title_documents_org_parcel_idx" ON "title_documents" USING btree ("organization_id","parcel_id");--> statement-breakpoint
CREATE INDEX "title_documents_stage_idx" ON "title_documents" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "title_documents_created_by_idx" ON "title_documents" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "title_stages_org_parcel_idx" ON "title_stages" USING btree ("organization_id","parcel_id");--> statement-breakpoint
CREATE INDEX "title_stages_org_status_idx" ON "title_stages" USING btree ("organization_id","status","status_on");--> statement-breakpoint
CREATE INDEX "title_stages_org_follow_up_idx" ON "title_stages" USING btree ("organization_id","follow_up_on") WHERE "title_stages"."follow_up_on" is not null;--> statement-breakpoint
CREATE INDEX "title_stages_updated_by_idx" ON "title_stages" USING btree ("updated_by_user_id");