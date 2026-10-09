CREATE TABLE "daily_habit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL,
	"exercise_ids" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"weekday" integer,
	"name" text NOT NULL,
	"rest_day" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL,
	"day_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"position" integer NOT NULL,
	"sets" integer NOT NULL,
	"target_reps" integer,
	"target_time_seconds" integer,
	"target_distance_metres" double precision,
	"rest_seconds" integer NOT NULL,
	"log_fields" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL,
	"name" text NOT NULL,
	"shape" text NOT NULL,
	"difficulty" text NOT NULL,
	"active" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_habit" ADD CONSTRAINT "daily_habit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_exercises" ADD CONSTRAINT "plan_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_habit_user_version_idx" ON "daily_habit" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "plan_days_user_version_idx" ON "plan_days" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "plan_exercises_user_version_idx" ON "plan_exercises" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "plans_user_version_idx" ON "plans" USING btree ("user_id","version");