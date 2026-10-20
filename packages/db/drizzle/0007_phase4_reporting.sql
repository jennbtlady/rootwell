CREATE TYPE "public"."ack_channel" AS ENUM('letter', 'email', 'phone', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."ack_status" AS ENUM('sent', 'marked', 'failed');--> statement-breakpoint
CREATE TABLE "acknowledgment_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"channel" "ack_channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"signature" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "acknowledgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"gift_id" uuid NOT NULL,
	"template_id" uuid,
	"channel" "ack_channel" NOT NULL,
	"status" "ack_status" NOT NULL,
	"recipient" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "board_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "dashboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "acknowledgment_templates" ADD CONSTRAINT "acknowledgment_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgments" ADD CONSTRAINT "acknowledgments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgments" ADD CONSTRAINT "acknowledgments_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgments" ADD CONSTRAINT "acknowledgments_template_id_acknowledgment_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."acknowledgment_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_share_links" ADD CONSTRAINT "board_share_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_snapshots" ADD CONSTRAINT "dashboard_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acknowledgment_templates_org_name_uq" ON "acknowledgment_templates" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "acknowledgments_gift_idx" ON "acknowledgments" USING btree ("gift_id");--> statement-breakpoint
CREATE INDEX "acknowledgments_org_created_idx" ON "acknowledgments" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "board_share_links_token_uq" ON "board_share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_snapshots_org_day_uq" ON "dashboard_snapshots" USING btree ("org_id","as_of");