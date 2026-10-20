CREATE TYPE "public"."batch_status" AS ENUM('open', 'posted');--> statement-breakpoint
CREATE TYPE "public"."constituent_type" AS ENUM('person', 'household', 'organization');--> statement-breakpoint
CREATE TYPE "public"."contact_point_type" AS ENUM('home', 'work', 'mobile', 'mailing', 'other');--> statement-breakpoint
CREATE TYPE "public"."external_source" AS ENUM('manual', 'stripe', 'import');--> statement-breakpoint
CREATE TYPE "public"."gift_type" AS ENUM('one_time', 'recurring', 'pledge', 'pledge_payment', 'in_kind', 'soft_credit');--> statement-breakpoint
CREATE TYPE "public"."interaction_type" AS ENUM('call', 'meeting', 'email', 'letter', 'event', 'note', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('check', 'cash', 'card', 'ach', 'stock', 'in_kind', 'other');--> statement-breakpoint
CREATE TYPE "public"."pledge_status" AS ENUM('open', 'fulfilled', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"campaign_id" uuid
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"goal_amount" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "constituent_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"line1" text,
	"line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'US' NOT NULL,
	"type" "contact_point_type" DEFAULT 'home' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "constituent_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"email" text NOT NULL,
	"type" "contact_point_type" DEFAULT 'home' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "constituent_phones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"digits" text DEFAULT '' NOT NULL,
	"type" "contact_point_type" DEFAULT 'mobile' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "constituent_tags" (
	"org_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "constituent_tags_constituent_id_tag_id_pk" PRIMARY KEY("constituent_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "constituents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "constituent_type" DEFAULT 'person' NOT NULL,
	"prefix" text,
	"first_name" text,
	"middle_name" text,
	"last_name" text,
	"suffix" text,
	"preferred_name" text,
	"org_name" text,
	"display_name" text DEFAULT '' NOT NULL,
	"sort_name" text DEFAULT '' NOT NULL,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"do_not_email" boolean DEFAULT false NOT NULL,
	"do_not_mail" boolean DEFAULT false NOT NULL,
	"do_not_call" boolean DEFAULT false NOT NULL,
	"deceased" boolean DEFAULT false NOT NULL,
	"deceased_on" date,
	"source" text,
	"assigned_to" uuid,
	"notes" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"from_constituent_id" uuid NOT NULL,
	"to_constituent_id" uuid NOT NULL,
	"type" text NOT NULL,
	"reciprocal_type" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"type" "interaction_type" DEFAULT 'note' NOT NULL,
	"occurred_on" date NOT NULL,
	"summary" text NOT NULL,
	"details" text,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"batch_date" date NOT NULL,
	"description" text,
	"status" "batch_status" DEFAULT 'open' NOT NULL,
	"expected_total" numeric(12, 2),
	"expected_count" integer,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"batch_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"gift_date" date NOT NULL,
	"fund_id" uuid,
	"campaign_id" uuid,
	"appeal_id" uuid,
	"payment_method" "payment_method" DEFAULT 'check' NOT NULL,
	"gift_type" "gift_type" DEFAULT 'one_time' NOT NULL,
	"check_number" text,
	"reference" text,
	"external_source" "external_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"fair_market_value" numeric(12, 2),
	"deductible_amount" numeric(12, 2),
	"acknowledged_at" timestamp with time zone,
	"acknowledgment_method" text,
	"notes" text,
	"recurring_plan_id" uuid,
	"pledge_id" uuid,
	"soft_credit_of_gift_id" uuid,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "pledges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"pledged_on" date NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"frequency" "recurring_frequency",
	"status" "pledge_status" DEFAULT 'open' NOT NULL,
	"fund_id" uuid,
	"campaign_id" uuid,
	"appeal_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "recurring_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"frequency" "recurring_frequency" DEFAULT 'monthly' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"fund_id" uuid,
	"campaign_id" uuid,
	"external_source" "external_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funds" ADD CONSTRAINT "funds_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_addresses" ADD CONSTRAINT "constituent_addresses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_addresses" ADD CONSTRAINT "constituent_addresses_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_emails" ADD CONSTRAINT "constituent_emails_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_emails" ADD CONSTRAINT "constituent_emails_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_phones" ADD CONSTRAINT "constituent_phones_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_phones" ADD CONSTRAINT "constituent_phones_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_tags" ADD CONSTRAINT "constituent_tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_tags" ADD CONSTRAINT "constituent_tags_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_tags" ADD CONSTRAINT "constituent_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituents" ADD CONSTRAINT "constituents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituents" ADD CONSTRAINT "constituents_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_from_constituent_id_constituents_id_fk" FOREIGN KEY ("from_constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_to_constituent_id_constituents_id_fk" FOREIGN KEY ("to_constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_recurring_plan_id_recurring_plans_id_fk" FOREIGN KEY ("recurring_plan_id") REFERENCES "public"."recurring_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_org_name_uq" ON "appeals" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_org_code_uq" ON "appeals" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "appeals_campaign_idx" ON "appeals" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_org_name_uq" ON "campaigns" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_org_code_uq" ON "campaigns" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "funds_org_name_uq" ON "funds" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "funds_org_code_uq" ON "funds" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "constituent_addresses_constituent_idx" ON "constituent_addresses" USING btree ("constituent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "constituent_emails_uq" ON "constituent_emails" USING btree ("constituent_id","email");--> statement-breakpoint
CREATE INDEX "constituent_emails_org_email_idx" ON "constituent_emails" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "constituent_phones_org_digits_idx" ON "constituent_phones" USING btree ("org_id","digits");--> statement-breakpoint
CREATE INDEX "constituent_phones_constituent_idx" ON "constituent_phones" USING btree ("constituent_id");--> statement-breakpoint
CREATE INDEX "constituent_tags_tag_idx" ON "constituent_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "constituents_org_sort_idx" ON "constituents" USING btree ("org_id","sort_name");--> statement-breakpoint
CREATE INDEX "relationships_from_idx" ON "relationships" USING btree ("from_constituent_id");--> statement-breakpoint
CREATE INDEX "relationships_to_idx" ON "relationships" USING btree ("to_constituent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_uq" ON "relationships" USING btree ("from_constituent_id","to_constituent_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_org_name_uq" ON "tags" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "interactions_constituent_date_idx" ON "interactions" USING btree ("constituent_id","occurred_on");--> statement-breakpoint
CREATE INDEX "interactions_org_date_idx" ON "interactions" USING btree ("org_id","occurred_on");--> statement-breakpoint
CREATE INDEX "batches_org_status_date_idx" ON "batches" USING btree ("org_id","status","batch_date");--> statement-breakpoint
CREATE INDEX "gifts_org_date_idx" ON "gifts" USING btree ("org_id","gift_date");--> statement-breakpoint
CREATE INDEX "gifts_constituent_date_idx" ON "gifts" USING btree ("constituent_id","gift_date");--> statement-breakpoint
CREATE INDEX "gifts_batch_idx" ON "gifts" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "gifts_fund_idx" ON "gifts" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "gifts_org_external_idx" ON "gifts" USING btree ("org_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "pledges_constituent_idx" ON "pledges" USING btree ("constituent_id");--> statement-breakpoint
CREATE INDEX "recurring_plans_constituent_idx" ON "recurring_plans" USING btree ("constituent_id");