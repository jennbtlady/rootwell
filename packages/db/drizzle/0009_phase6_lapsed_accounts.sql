ALTER TYPE "public"."actor_kind" ADD VALUE 'scheduler';--> statement-breakpoint
CREATE TABLE "deleted_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"former_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"org_created_at" timestamp with time zone NOT NULL,
	"subscription_status" text NOT NULL,
	"lapsed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"notices_sent" smallint[] NOT NULL,
	"members_notified" integer NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "lapse_notices_sent" smallint[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "lapse_notices_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "lapse_final_notice_at" timestamp with time zone;