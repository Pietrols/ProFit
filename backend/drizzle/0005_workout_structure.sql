CREATE TABLE "session_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL,
	"session_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"original_position" integer,
	"replaces_item_id" uuid,
	"position" integer NOT NULL,
	"state" text NOT NULL,
	"reason" text,
	"exercise" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "side" text;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "targets_at_performance" jsonb;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_items_user_version_idx" ON "session_items" USING btree ("user_id","version");