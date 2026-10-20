CREATE TYPE "public"."duplicate_status" AS ENUM('open', 'merged', 'not_duplicate');--> statement-breakpoint
CREATE TABLE "duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	"score" real NOT NULL,
	"reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "duplicate_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "merge_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"surviving_id" uuid NOT NULL,
	"merged_id" uuid NOT NULL,
	"merged_display_name" text NOT NULL,
	"decisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reversible_until" timestamp with time zone NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_a_id_constituents_id_fk" FOREIGN KEY ("a_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_b_id_constituents_id_fk" FOREIGN KEY ("b_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_history" ADD CONSTRAINT "merge_history_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_history" ADD CONSTRAINT "merge_history_surviving_id_constituents_id_fk" FOREIGN KEY ("surviving_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_candidates_pair_uq" ON "duplicate_candidates" USING btree ("org_id","a_id","b_id");--> statement-breakpoint
CREATE INDEX "duplicate_candidates_org_status_idx" ON "duplicate_candidates" USING btree ("org_id","status","score");--> statement-breakpoint
CREATE INDEX "merge_history_org_idx" ON "merge_history" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "merge_history_surviving_idx" ON "merge_history" USING btree ("surviving_id");