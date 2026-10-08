// Errors the API client raises. Screens decide what to show from these, never from raw responses.

// The API answered with an error. code matches the API's { error: { code, message } } body.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// The request never got an answer: no connection, the server is down, or it timed out.
export class NetworkError extends Error {
  constructor(message = 'No connection to ProFit right now.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

// Reads the API's error body. Falls back to a generic message when the body is not ours
// (a proxy error page, an empty body).
export function errorFromBody(status: number, text: string): ApiError {
  let code = 'HTTP_' + status;
  let message = 'Something went wrong. Try again in a moment.';
  try {
    const body: unknown = JSON.parse(text);
    const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    if (typeof error?.code === 'string') code = error.code;
    if (typeof error?.message === 'string') message = error.message;
  } catch {
    // Not JSON: keep the generic message.
  }
  return new ApiError(status, code, message);
}

export async function errorFromResponse(response: Response): Promise<ApiError> {
  const text = await response.text().catch(() => '');
  return errorFromBody(response.status, text);
}

// A short line a screen can show for any error the client raises.
export function messageFor(error: unknown): string {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Try again in a moment.';
}
