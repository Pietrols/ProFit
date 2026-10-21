// Frozen migration. Rebuild only to permit a null original position for added exercises.
const dirty = (source: 'OLD' | 'NEW') => `
  INSERT INTO workout_history_dirty VALUES (${source}.user_id, ${source}.session_id)
    ON CONFLICT (user_id, session_id) DO NOTHING;`;
function itemEffects(source: 'OLD' | 'NEW') {
  const exercise = `json_extract(CASE WHEN json_valid(${source}.exercise) THEN ${source}.exercise ELSE '{}' END, '$.exerciseId')`;
  return `${dirty(source)}
  INSERT INTO workout_history_catalog
    SELECT ${source}.user_id, ${exercise}, ${source}.session_id
    WHERE typeof(${exercise}) = 'text' ON CONFLICT DO NOTHING;`;
}
export const WORKOUT_STRUCTURE_V8 = `
CREATE TABLE session_items (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
  origin TEXT NOT NULL, original_position INTEGER, replaces_item_id TEXT,
  position INTEGER NOT NULL, state TEXT NOT NULL, reason TEXT, exercise TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX session_items_user_dirty ON session_items (user_id, dirty);
CREATE INDEX session_items_user_session ON session_items (user_id, session_id);

CREATE TABLE set_logs_v8 (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
  exercise_position INTEGER, set_index INTEGER NOT NULL, logged_at TEXT NOT NULL,
  log_fields TEXT NOT NULL, values_json TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0,
  item_id TEXT, side TEXT, targets_at_performance TEXT
);
INSERT INTO set_logs_v8
  (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields, values_json, updated_at, deleted_at, dirty)
  SELECT id, user_id, session_id, exercise_position, set_index, logged_at, log_fields,
    values_json, updated_at, deleted_at, dirty FROM set_logs;
DROP TABLE set_logs;
ALTER TABLE set_logs_v8 RENAME TO set_logs;
CREATE INDEX set_logs_user_dirty ON set_logs (user_id, dirty);
CREATE INDEX set_logs_user_session ON set_logs (user_id, session_id);
CREATE INDEX set_logs_user_item ON set_logs (user_id, item_id);

CREATE TRIGGER workout_history_set_insert AFTER INSERT ON set_logs BEGIN
  ${dirty('NEW')}
END;
CREATE TRIGGER workout_history_set_update
AFTER UPDATE OF user_id, session_id, exercise_position, set_index, logged_at, log_fields,
  values_json, updated_at, deleted_at, item_id, side, targets_at_performance ON set_logs BEGIN
  ${dirty('OLD')}
  ${dirty('NEW')}
END;
CREATE TRIGGER workout_history_set_delete AFTER DELETE ON set_logs BEGIN
  ${dirty('OLD')}
END;
CREATE TRIGGER workout_history_item_insert AFTER INSERT ON session_items BEGIN
  ${itemEffects('NEW')}
END;
CREATE TRIGGER workout_history_item_update
AFTER UPDATE OF user_id, session_id, origin, original_position, replaces_item_id,
  position, state, reason, exercise, updated_at, deleted_at ON session_items BEGIN
  ${itemEffects('OLD')}
  ${itemEffects('NEW')}
END;
CREATE TRIGGER workout_history_item_delete AFTER DELETE ON session_items BEGIN
  ${itemEffects('OLD')}
END;
`;
