// Frozen SQL expression for migration/index compatibility. Add a new version if it must change.
// Match Date.parse's millisecond truncation, including offsets and sub-millisecond fractions.
export function timeSqlV1(column: 'started_at' | 'ended_at'): string {
  const utc = `CAST(strftime('%s', substr(${column}, 1, 19) || 'Z') AS INTEGER) * 1000`;
  const zoneLength = `(CASE WHEN substr(${column}, -1) = 'Z' THEN 1 ELSE 6 END)`;
  const fraction = `CASE WHEN substr(${column}, 20, 1) = '.' THEN
    CAST(substr(substr(${column}, 21, length(${column}) - 20 - ${zoneLength}) || '000', 1, 3) AS INTEGER)
    ELSE 0 END`;
  const offset = `CASE WHEN substr(${column}, -1) = 'Z' THEN 0 ELSE
    (CASE WHEN substr(${column}, -6, 1) = '-' THEN -1 ELSE 1 END) *
    (CAST(substr(${column}, -5, 2) AS INTEGER) * 60 + CAST(substr(${column}, -2) AS INTEGER)) * 60000 END`;
  return `(${utc} + (${fraction}) - (${offset}))`;
}
