CREATE TYPE "public"."tribute_kind" AS ENUM('honor', 'memory');--> statement-breakpoint
ALTER TYPE "public"."gift_type" ADD VALUE 'refund';--> statement-breakpoint
CREATE TABLE "gift_tributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"gift_id" uuid NOT NULL,
	"kind" "tribute_kind" NOT NULL,
	"honoree_name" text NOT NULL,
	"notify_name" text,
	"notify_email" text,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sponsor_animals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"photo_path" text,
	"fund_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "receipts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "gifts" ADD COLUMN "reverses_gift_id" uuid;--> statement-breakpoint
ALTER TABLE "gifts" ADD COLUMN "donor_message" text;--> statement-breakpoint
ALTER TABLE "gifts" ADD COLUMN "sponsor_animal_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD COLUMN "sponsor_animal_id" uuid;--> statement-breakpoint
ALTER TABLE "donation_pages" ADD COLUMN "allow_tribute" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "donation_pages" ADD COLUMN "allow_message" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "donation_pages" ADD COLUMN "animal_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_tributes" ADD CONSTRAINT "gift_tributes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_tributes" ADD CONSTRAINT "gift_tributes_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_animals" ADD CONSTRAINT "sponsor_animals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_animals" ADD CONSTRAINT "sponsor_animals_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_tributes_gift_uq" ON "gift_tributes" USING btree ("gift_id");--> statement-breakpoint
CREATE INDEX "gift_tributes_org_idx" ON "gift_tributes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sponsor_animals_org_idx" ON "sponsor_animals" USING btree ("org_id","sort_order");--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_sponsor_animal_id_sponsor_animals_id_fk" FOREIGN KEY ("sponsor_animal_id") REFERENCES "public"."sponsor_animals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_sponsor_animal_id_sponsor_animals_id_fk" FOREIGN KEY ("sponsor_animal_id") REFERENCES "public"."sponsor_animals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gifts_reverses_idx" ON "gifts" USING btree ("reverses_gift_id");