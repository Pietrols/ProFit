CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_position" integer NOT NULL,
	"set_index" integer NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"log_fields" text[] NOT NULL,
	"values" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL,
	"plan_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"status" text NOT NULL,
	"notes" text NOT NULL,
	"easier_today" boolean NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "set_logs_user_version_idx" ON "set_logs" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_version_idx" ON "workout_sessions" USING btree ("user_id","version");