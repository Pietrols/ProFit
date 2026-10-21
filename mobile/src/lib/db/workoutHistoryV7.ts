// Frozen migration. The catalog contains exercise ids, not performed results.
const exercise = `json_extract(CASE WHEN e.type = 'object' THEN e.value ELSE '{}' END, '$.exerciseId')`;
function catalogRows(parent: string) {
  return `SELECT ${parent}.user_id, ${exercise}, ${parent}.id
    FROM json_each(CASE WHEN json_valid(${parent}.snapshot) THEN ${parent}.snapshot ELSE '{}' END, '$.exercises') e
    WHERE typeof(${exercise}) = 'text'`;
}
export const WORKOUT_HISTORY_V7 = `
CREATE TABLE workout_history_catalog (
  user_id TEXT NOT NULL, exercise_id TEXT NOT NULL, session_id TEXT NOT NULL,
  PRIMARY KEY (user_id, exercise_id, session_id)
);
CREATE INDEX workout_history_catalog_session ON workout_history_catalog (user_id, session_id);
INSERT INTO workout_history_catalog
  SELECT s.user_id, ${exercise}, s.id FROM workout_sessions s,
    json_each(CASE WHEN json_valid(s.snapshot) THEN s.snapshot ELSE '{}' END, '$.exercises') e
  WHERE typeof(${exercise}) = 'text' ON CONFLICT DO NOTHING;
CREATE TRIGGER workout_history_catalog_insert AFTER INSERT ON workout_sessions BEGIN
  INSERT INTO workout_history_catalog ${catalogRows('NEW')} ON CONFLICT DO NOTHING;
END;
CREATE TRIGGER workout_history_catalog_update AFTER UPDATE OF user_id, snapshot ON workout_sessions BEGIN
  INSERT INTO workout_history_catalog ${catalogRows('NEW')} ON CONFLICT DO NOTHING;
END;
`;
