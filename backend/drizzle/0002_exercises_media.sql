CREATE TABLE "custom_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"equipment" text,
	"primary_muscles" text[] NOT NULL,
	"secondary_muscles" text[] NOT NULL,
	"tracking" text NOT NULL,
	"instructions" text,
	"photo_id" uuid
);
--> statement-breakpoint
CREATE TABLE "exercise_favourites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL,
	"exercise_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_exercises" ADD CONSTRAINT "custom_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_favourites" ADD CONSTRAINT "exercise_favourites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_exercises_user_version_idx" ON "custom_exercises" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "exercise_favourites_user_version_idx" ON "exercise_favourites" USING btree ("user_id","version");