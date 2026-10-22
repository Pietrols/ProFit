const names = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'DrizzleQueryError',
]);

function databaseCode(value: unknown): string | undefined {
  if (!(value instanceof Error) || !('code' in value)) return;
  return typeof value.code === 'string' && /^[0-9A-Z]{5}$/.test(value.code)
    ? value.code
    : undefined;
}

// Database error messages can contain SQL parameters and private profile/workout text.
// Keep diagnostic frames and SQLSTATE, never messages, query text, params or nested causes.
export function safeErrorDetails(value: unknown) {
  if (!(value instanceof Error)) return { type: 'UnknownError' };
  const prefix = `${value.name}: ${value.message}`;
  const stack = value.stack?.startsWith(prefix)
    ? value.stack
        .slice(prefix.length)
        .split('\n')
        .filter((line) => line.startsWith('    at '))
        .slice(0, 8)
        .join('\n')
    : undefined;
  return {
    type: names.has(value.name) ? value.name : 'Error',
    databaseCode: databaseCode(value) ?? databaseCode(value.cause),
    stack: stack || undefined,
  };
}
