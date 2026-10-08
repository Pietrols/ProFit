import { bigint, date, doublePrecision, index, integer, pgEnum, pgSequence, pgTable, real, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// The values here are the API's values too, so the Zod schemas build their enums from these lists.
export const GOALS = ['weight_loss', 'bodybuilding', 'calisthenics', 'athlete', 'powerlifting', 'general_fitness'] as const;
export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const TRAINING_PLACES = ['home', 'gym', 'both'] as const;
export const SEXES = ['female', 'male'] as const;
export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export const ONBOARDING_STATUSES = ['pending', 'completed', 'skipped'] as const;

export const goalEnum = pgEnum('goal', GOALS);
export const experienceEnum = pgEnum('experience', EXPERIENCE_LEVELS);
export const trainingPlaceEnum = pgEnum('training_place', TRAINING_PLACES);
export const sexEnum = pgEnum('sex', SEXES);
export const unitSystemEnum = pgEnum('unit_system', UNIT_SYSTEMS);
export const onboardingStatusEnum = pgEnum('onboarding_status', ONBOARDING_STATUSES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// One row per Google account. google_sub is Google's permanent id for the account;
// the email can change, so it is never used to find a user.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  avatarUrl: text('avatar_url'),
  ...timestamps,
});

// What the user tells ProFit about themselves. Everything except the unit system and onboarding
// status is optional, because onboarding can be skipped and filled in later.
export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  goal: goalEnum('goal'),
  experience: experienceEnum('experience'),
  trainingPlace: trainingPlaceEnum('training_place'),
  unitSystem: unitSystemEnum('unit_system').notNull().default('metric'),
  // Birth year rather than age, so it never goes out of date.
  birthYear: integer('birth_year'),
  sex: sexEnum('sex'),
  heightCm: real('height_cm'),
  daysPerWeek: smallint('days_per_week'),
  limitations: text('limitations'),
  onboardingStatus: onboardingStatusEnum('onboarding_status').notNull().default('pending'),
  ...timestamps,
});

// Refresh tokens are stored as SHA-256 hashes only. A family is one chain of rotated tokens that
// started from a single sign-in; reusing an old token revokes the whole family.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('refresh_tokens_family_idx').on(t.familyId), index('refresh_tokens_user_idx').on(t.userId)],
);

// Every write to a synced table takes the next number from this one sequence. A phone asks for
// "everything after version N", so one number covers every synced table.
export const syncVersionSeq = pgSequence('sync_version_seq');

// Columns every synced table has. id is made on the phone; updated_at is the phone's edit time and
// decides which copy wins a merge; deleted_at marks a delete so it can sync to other phones.
const syncColumns = {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  version: bigint('version', { mode: 'number' }).notNull(),
};

// Body-weight log: one weigh-in per user per day (the phone derives the id from user and date).
export const weightEntries = pgTable(
  'weight_entries',
  {
    ...syncColumns,
    date: date('date', { mode: 'string' }).notNull(),
    weightKg: doublePrecision('weight_kg').notNull(),
    note: text('note'),
  },
  (t) => [index('weight_entries_user_version_idx').on(t.userId, t.version)],
);

// Exercises a user made themselves. Built-in exercises live in the app, not here.
export const customExercises = pgTable(
  'custom_exercises',
  {
    ...syncColumns,
    name: text('name').notNull(),
    category: text('category').notNull(),
    equipment: text('equipment'),
    primaryMuscles: text('primary_muscles').array().notNull(),
    secondaryMuscles: text('secondary_muscles').array().notNull(),
    tracking: text('tracking').notNull(),
    instructions: text('instructions'),
    photoId: uuid('photo_id'),
  },
  (t) => [index('custom_exercises_user_version_idx').on(t.userId, t.version)],
);

// A starred exercise. The phone derives the id from user and exercise, so starring the same exercise
// on two phones is one row; un-starring sets deleted_at.
export const exerciseFavourites = pgTable(
  'exercise_favourites',
  {
    ...syncColumns,
    exerciseId: text('exercise_id').notNull(),
  },
  (t) => [index('exercise_favourites_user_version_idx').on(t.userId, t.version)],
);

// Uploaded images. The file lives on disk under MEDIA_DIR; this row says whose it is and what it is.
export const media = pgTable('media', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type WeightEntry = typeof weightEntries.$inferSelect;
