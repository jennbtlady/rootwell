CREATE TABLE "rate_limit_hits" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rate_limit_hits_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
