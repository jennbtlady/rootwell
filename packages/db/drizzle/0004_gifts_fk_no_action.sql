ALTER TABLE "gifts" DROP CONSTRAINT "gifts_constituent_id_constituents_id_fk";
--> statement-breakpoint
ALTER TABLE "gifts" DROP CONSTRAINT "gifts_fund_id_funds_id_fk";
--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;