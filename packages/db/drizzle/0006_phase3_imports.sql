CREATE TYPE "public"."import_kind" AS ENUM('constituents', 'constituents_gifts');--> statement-breakpoint
CREATE TYPE "public"."import_row_action" AS ENUM('create', 'match', 'review', 'skip', 'error');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploading', 'ready', 'committed', 'rolled_back');--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "import_kind" NOT NULL,
	"file_name" text NOT NULL,
	"headers" text[] NOT NULL,
	"expected_rows" integer NOT NULL,
	"status" "import_status" DEFAULT 'uploading' NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"batch_id" uuid,
	"created" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"committed_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "import_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "import_kind" NOT NULL,
	"headers" text[] NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" text[] NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mapped" jsonb,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"person_key" text,
	"action" "import_row_action" DEFAULT 'create' NOT NULL,
	"match_constituent_id" uuid,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_constituent_id" uuid,
	"created_gift_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_mappings" ADD CONSTRAINT "import_mappings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_jobs_org_idx" ON "import_jobs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_mappings_org_name_uq" ON "import_mappings" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_job_row_uq" ON "import_rows" USING btree ("job_id","row_number");--> statement-breakpoint
CREATE INDEX "import_rows_job_person_idx" ON "import_rows" USING btree ("job_id","person_key");--> statement-breakpoint
CREATE INDEX "import_rows_job_action_idx" ON "import_rows" USING btree ("job_id","action");