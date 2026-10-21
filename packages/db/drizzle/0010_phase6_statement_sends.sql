CREATE TABLE "statement_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"tax_year" integer NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"recipient" text,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "statement_sends" ADD CONSTRAINT "statement_sends_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_sends" ADD CONSTRAINT "statement_sends_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "statement_sends_uq" ON "statement_sends" USING btree ("org_id","constituent_id","tax_year","channel");--> statement-breakpoint
CREATE INDEX "statement_sends_org_year_idx" ON "statement_sends" USING btree ("org_id","tax_year");