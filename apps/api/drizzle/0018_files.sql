CREATE TYPE "public"."file_purpose" AS ENUM('title_document');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('uploading', 'ready', 'rejected', 'deleting');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"status" "file_status" DEFAULT 'uploading' NOT NULL,
	"object_key" text NOT NULL,
	"upload_id" text,
	"original_name" text NOT NULL,
	"declared_type" text NOT NULL,
	"content_type" text,
	"size_bytes" bigint NOT NULL,
	"sha256" char(64),
	"uploaded_by_user_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"attached_at" timestamp with time zone,
	"incoming_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "files_size_positive" CHECK ("files"."size_bytes" > 0),
	CONSTRAINT "files_original_name_length" CHECK (char_length("files"."original_name") between 1 and 200),
	CONSTRAINT "files_ready_complete" CHECK ("files"."status" <> 'ready' or ("files"."content_type" is not null and "files"."sha256" is not null and "files"."completed_at" is not null and "files"."upload_id" is null)),
	CONSTRAINT "files_attached_ready" CHECK ("files"."attached_at" is null or "files"."status" = 'ready'),
	CONSTRAINT "files_sha256_hex" CHECK ("files"."sha256" is null or "files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "files_object_key_layout" CHECK ("files"."object_key" = case when "files"."attached_at" is null then 'incoming/' else 'kept/' end || 'org/' || "files"."organization_id" || '/' || "files"."id"),
	CONSTRAINT "files_incoming_deleted_attached" CHECK ("files"."incoming_deleted_at" is null or "files"."attached_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_unattached_idx" ON "files" USING btree ("id") WHERE "files"."attached_at" is null;--> statement-breakpoint
CREATE INDEX "files_incoming_left_idx" ON "files" USING btree ("id") WHERE "files"."attached_at" is not null and "files"."incoming_deleted_at" is null;--> statement-breakpoint
CREATE INDEX "files_uploader_unattached_idx" ON "files" USING btree ("uploaded_by_user_id","status") WHERE "files"."attached_at" is null;