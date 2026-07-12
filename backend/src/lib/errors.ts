import { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, code = "BAD_REQUEST") {
    return new ApiError(400, code, message);
  }
  static unauthorized(message: string, code = "UNAUTHORIZED") {
    return new ApiError(401, code, message);
  }
  static notFound(message: string, code = "NOT_FOUND") {
    return new ApiError(404, code, message);
  }
  static conflict(message: string, code = "CONFLICT") {
    return new ApiError(409, code, message);
  }
}

/** Parse `data` with `schema`, throwing a 400 ApiError listing each bad field. */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    throw new ApiError(400, "VALIDATION_ERROR", detail);
  }
  return result.data;
}
