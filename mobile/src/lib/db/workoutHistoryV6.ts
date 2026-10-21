// Frozen migration SQL. This projection can be rebuilt from canonical workouts and is never synced.
export const WORKOUT_HISTORY_V6 = `
CREATE TABLE workout_history_index (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL, completed_ms INTEGER NOT NULL, logged_ms INTEGER NOT NULL,
  weight REAL, reps INTEGER, time REAL, distance REAL, rest REAL, eligible_weight REAL,
  one_rep_max REAL, log_json TEXT NOT NULL
);
CREATE INDEX workout_history_session ON workout_history_index (user_id, session_id);
CREATE INDEX workout_history_latest ON workout_history_index (user_id, exercise_id, logged_ms DESC, id DESC);
CREATE INDEX workout_history_load ON workout_history_index (user_id, exercise_id, eligible_weight DESC);
CREATE INDEX workout_history_reps ON workout_history_index (user_id, exercise_id, weight, reps DESC);
CREATE INDEX workout_history_one_rep_max ON workout_history_index (user_id, exercise_id, one_rep_max DESC);
CREATE INDEX workout_history_time ON workout_history_index (user_id, exercise_id, time DESC);
CREATE TABLE workout_history_dirty (
  user_id TEXT NOT NULL, session_id TEXT NOT NULL, PRIMARY KEY (user_id, session_id)
);
INSERT INTO workout_history_dirty (user_id, session_id)
  SELECT user_id, id FROM workout_sessions WHERE status = 'completed' AND deleted_at IS NULL;

CREATE TRIGGER workout_history_session_insert AFTER INSERT ON workout_sessions BEGIN
  INSERT INTO workout_history_dirty VALUES (NEW.user_id, NEW.id) ON CONFLICT (user_id, session_id) DO NOTHING;
END;
CREATE TRIGGER workout_history_session_update
AFTER UPDATE OF user_id, snapshot, started_at, ended_at, status, deleted_at ON workout_sessions BEGIN
  INSERT INTO workout_history_dirty VALUES (OLD.user_id, OLD.id) ON CONFLICT (user_id, session_id) DO NOTHING;
  INSERT INTO workout_history_dirty VALUES (NEW.user_id, NEW.id) ON CONFLICT (user_id, session_id) DO NOTHING;
END;
CREATE TRIGGER workout_history_session_delete AFTER DELETE ON workout_sessions BEGIN
  INSERT INTO workout_history_dirty VALUES (OLD.user_id, OLD.id) ON CONFLICT (user_id, session_id) DO NOTHING;
END;
CREATE TRIGGER workout_history_set_insert AFTER INSERT ON set_logs BEGIN
  INSERT INTO workout_history_dirty VALUES (NEW.user_id, NEW.session_id) ON CONFLICT (user_id, session_id) DO NOTHING;
END;
CREATE TRIGGER workout_history_set_update
AFTER UPDATE OF user_id, session_id, exercise_position, set_index, logged_at, log_fields,
  values_json, updated_at, deleted_at ON set_logs BEGIN
  INSERT INTO workout_history_dirty VALUES (OLD.user_id, OLD.session_id) ON CONFLICT (user_id, session_id) DO NOTHING;
  INSERT INTO workout_history_dirty VALUES (NEW.user_id, NEW.session_id) ON CONFLICT (user_id, session_id) DO NOTHING;
END;
CREATE TRIGGER workout_history_set_delete AFTER DELETE ON set_logs BEGIN
  INSERT INTO workout_history_dirty VALUES (OLD.user_id, OLD.session_id) ON CONFLICT (user_id, session_id) DO NOTHING;
END;
`;
