import type { z } from 'zod';
import { AppError } from './errors.js';

// Parses untrusted input against a schema, or answers 400 VALIDATION_FAILED naming each problem.
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
      .join('; ');
    throw new AppError(400, 'VALIDATION_FAILED', message);
  }
  return result.data;
}
