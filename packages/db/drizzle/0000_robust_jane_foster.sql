CREATE TYPE "public"."actor_kind" AS ENUM('user', 'system', 'support');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'delete', 'merge', 'unmerge');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'staff', 'board_viewer');--> statement-breakpoint
CREATE TYPE "public"."ownership_event_kind" AS ENUM('transfer', 'support_override');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ein" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"logo_path" text,
	"gift_entry_standards" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hide_board_names" boolean DEFAULT true NOT NULL,
	"sample_org_enabled" boolean DEFAULT true NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"read_only_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "organizations_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "organizations_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"role" "org_role" NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"invited_email" text,
	"invited_by" uuid,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_kind" "actor_kind" DEFAULT 'user' NOT NULL,
	"table_name" text NOT NULL,
	"row_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownership_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "ownership_event_kind" NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid NOT NULL,
	"performed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_from_user_id_profiles_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_to_user_id_profiles_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_memberships_org_user_uq" ON "org_memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "org_memberships_user_idx" ON "org_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_memberships_invite_token_uq" ON "org_memberships" USING btree ("invite_token_hash");--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_row_idx" ON "audit_log" USING btree ("table_name","row_id");