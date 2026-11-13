CREATE TYPE "public"."org_module" AS ENUM('donations', 'peer_fundraising', 'events', 'auction');--> statement-breakpoint
ALTER TYPE "public"."integration_status" ADD VALUE 'needs_info';--> statement-breakpoint
CREATE TABLE "organization_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"module" "org_module" NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "branding" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_modules" ADD CONSTRAINT "organization_modules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_modules_org_module_uq" ON "organization_modules" USING btree ("org_id","module");--> statement-breakpoint
CREATE INDEX "organization_modules_org_idx" ON "organization_modules" USING btree ("org_id");