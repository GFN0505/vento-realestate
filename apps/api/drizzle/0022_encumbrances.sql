CREATE TYPE "public"."encumbrance_status" AS ENUM('active', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."encumbrance_type" AS ENUM('court_order', 'caveat', 'family_dispute', 'lien', 'mortgage');--> statement-breakpoint
-- IF NOT EXISTS: Postgres can't drop an enum value, so a dev database that ran an earlier draft of
-- this migration (rolled back by hand) keeps it.
ALTER TYPE "public"."title_document_type" ADD VALUE IF NOT EXISTS 'encumbrance_evidence' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "encumbrances" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"parcel_id" uuid NOT NULL,
	"type" "encumbrance_type" NOT NULL,
	"status" "encumbrance_status" DEFAULT 'active' NOT NULL,
	"blocks_sales" boolean NOT NULL,
	"claimant" text NOT NULL,
	"served_on" date NOT NULL,
	"reference" text,
	"lawyer" text,
	"next_on" date,
	"notes" text,
	"evidence_document_id" uuid NOT NULL,
	"evidence_version_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"cleared_on" date,
	"clearance_document_id" uuid,
	"clearance_version_id" uuid,
	"clearance_note" text,
	"cleared_at" timestamp with time zone,
	"cleared_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encumbrances_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "encumbrances_org_parcel_id_unique" UNIQUE("organization_id","parcel_id","id"),
	CONSTRAINT "encumbrances_mortgage_choice" CHECK ("encumbrances"."type"::text = 'mortgage' or "encumbrances"."blocks_sales"),
	CONSTRAINT "encumbrances_cleared_consistent" CHECK (("encumbrances"."status"::text = 'active' and "encumbrances"."cleared_on" is null and "encumbrances"."clearance_document_id" is null and "encumbrances"."clearance_version_id" is null and "encumbrances"."cleared_at" is null and "encumbrances"."cleared_by_user_id" is null) or ("encumbrances"."status"::text = 'cleared' and "encumbrances"."cleared_on" is not null and "encumbrances"."clearance_document_id" is not null and "encumbrances"."clearance_version_id" is not null and "encumbrances"."cleared_at" is not null and "encumbrances"."cleared_by_user_id" is not null)),
	CONSTRAINT "encumbrances_cleared_after_served" CHECK ("encumbrances"."cleared_on" is null or "encumbrances"."cleared_on" >= "encumbrances"."served_on"),
	CONSTRAINT "encumbrances_served_from_1900" CHECK ("encumbrances"."served_on" >= date '1900-01-01'),
	CONSTRAINT "encumbrances_next_after_served" CHECK ("encumbrances"."next_on" is null or "encumbrances"."next_on" >= "encumbrances"."served_on" - interval '1 year'),
	CONSTRAINT "encumbrances_claimant_length" CHECK (char_length("encumbrances"."claimant") between 2 and 200),
	CONSTRAINT "encumbrances_notes_length" CHECK ("encumbrances"."notes" is null or char_length("encumbrances"."notes") <= 2000),
	CONSTRAINT "encumbrances_clearance_note_length" CHECK ("encumbrances"."clearance_note" is null or char_length("encumbrances"."clearance_note") <= 1000),
	CONSTRAINT "encumbrances_version_positive" CHECK ("encumbrances"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "title_documents" DROP CONSTRAINT "title_documents_single_unnamed";--> statement-breakpoint
ALTER TABLE "title_documents" ADD CONSTRAINT "title_documents_org_parcel_id_unique" UNIQUE("organization_id","parcel_id","id");--> statement-breakpoint
ALTER TABLE "title_document_versions" ADD CONSTRAINT "title_document_versions_org_document_id_unique" UNIQUE("organization_id","document_id","id");--> statement-breakpoint
ALTER TABLE "encumbrances" ADD CONSTRAINT "encumbrances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encumbrances" ADD CONSTRAINT "encumbrances_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encumbrances" ADD CONSTRAINT "encumbrances_cleared_by_user_id_users_id_fk" FOREIGN KEY ("cleared_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encumbrances" ADD CONSTRAINT "encumbrances_parcel_fk" FOREIGN KEY ("organization_id","parcel_id") REFERENCES "public"."parcels"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encumbrances" ADD CONSTRAINT "encumbrances_evidence_fk" FOREIGN KEY ("organization_id","parcel_id","evidence_document_id") REFERENCES "public"."title_documents"("organization_id","parcel_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encumbrances" ADD CONSTRAINT "encumbrances_clearance_fk" FOREIGN KEY ("organization_id","parcel_id","clearance_document_id") REFERENCES "public"."title_documents"("organization_id","parcel_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encumbrances" ADD CONSTRAINT "encumbrances_evidence_version_fk" FOREIGN KEY ("organization_id","evidence_document_id","evidence_version_id") REFERENCES "public"."title_document_versions"("organization_id","document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encumbrances" ADD CONSTRAINT "encumbrances_clearance_version_fk" FOREIGN KEY ("organization_id","clearance_document_id","clearance_version_id") REFERENCES "public"."title_document_versions"("organization_id","document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encumbrances_org_parcel_idx" ON "encumbrances" USING btree ("organization_id","parcel_id");--> statement-breakpoint
CREATE INDEX "encumbrances_blocking_idx" ON "encumbrances" USING btree ("organization_id","parcel_id") WHERE "encumbrances"."status" = 'active' and "encumbrances"."blocks_sales";--> statement-breakpoint
CREATE INDEX "encumbrances_org_next_idx" ON "encumbrances" USING btree ("organization_id","next_on") WHERE "encumbrances"."status" = 'active' and "encumbrances"."next_on" is not null;--> statement-breakpoint
CREATE INDEX "encumbrances_org_served_idx" ON "encumbrances" USING btree ("organization_id","served_on") WHERE "encumbrances"."status" = 'active';--> statement-breakpoint
CREATE INDEX "encumbrances_evidence_idx" ON "encumbrances" USING btree ("evidence_document_id");--> statement-breakpoint
CREATE INDEX "encumbrances_clearance_idx" ON "encumbrances" USING btree ("clearance_document_id");--> statement-breakpoint
CREATE INDEX "encumbrances_evidence_version_idx" ON "encumbrances" USING btree ("evidence_version_id");--> statement-breakpoint
CREATE INDEX "encumbrances_clearance_version_idx" ON "encumbrances" USING btree ("clearance_version_id");--> statement-breakpoint
CREATE INDEX "encumbrances_recorded_by_idx" ON "encumbrances" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "encumbrances_cleared_by_idx" ON "encumbrances" USING btree ("cleared_by_user_id");--> statement-breakpoint
ALTER TABLE "title_documents" ADD CONSTRAINT "title_documents_encumbrance_named" CHECK ("title_documents"."type"::text <> 'encumbrance_evidence' or "title_documents"."name" is not null);--> statement-breakpoint
-- Security L7: no NOT VALID + VALIDATE CONSTRAINT here. drizzle's migrator runs every pending
-- migration in one transaction, so the ACCESS EXCLUSIVE lock this ALTER takes is held until commit
-- whatever a later VALIDATE does; splitting it would only add a statement. The drop above and this
-- re-add sit in that same transaction, so the check is never missing to other sessions.
ALTER TABLE "title_documents" ADD CONSTRAINT "title_documents_single_unnamed" CHECK ("title_documents"."type"::text in ('family_receipt', 'land_purchase_agreement', 'deed_of_assignment', 'encumbrance_evidence', 'other') or "title_documents"."name" is null);