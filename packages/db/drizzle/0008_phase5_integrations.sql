CREATE TYPE "public"."integration_provider" AS ENUM('stripe', 'mailchimp');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'error', 'disconnected');--> statement-breakpoint
CREATE TABLE "donation_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"intro" text,
	"thank_you" text,
	"fund_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"campaign_id" uuid,
	"amounts" integer[] DEFAULT '{25,50,100,250}'::int[] NOT NULL,
	"allow_monthly" boolean DEFAULT true NOT NULL,
	"offer_cover_fees" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"status" "integration_status" DEFAULT 'connected' NOT NULL,
	"account_id" text,
	"credentials" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_summary" jsonb,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"provider" "integration_provider" NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" text,
	"error" text,
	"needs_attention" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "accounting" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "income_account" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "gifts" ADD COLUMN "fee_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "gifts" ADD COLUMN "net_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "gifts" ADD COLUMN "fee_covered_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "gifts" ADD COLUMN "source_platform" text;--> statement-breakpoint
ALTER TABLE "donation_pages" ADD CONSTRAINT "donation_pages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_pages" ADD CONSTRAINT "donation_pages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "donation_pages_slug_uq" ON "donation_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "donation_pages_org_idx" ON "donation_pages" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_org_provider_uq" ON "integrations" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "integrations_account_idx" ON "integrations" USING btree ("provider","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_uq" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_org_idx" ON "webhook_events" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_org_external_uq" ON "batches" USING btree ("org_id","external_source","external_id");