ALTER TABLE "org_memberships" DROP CONSTRAINT "org_memberships_invited_by_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "ownership_events" DROP CONSTRAINT "ownership_events_from_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "ownership_events" DROP CONSTRAINT "ownership_events_to_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "ownership_events" ALTER COLUMN "to_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_from_user_id_profiles_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_to_user_id_profiles_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;