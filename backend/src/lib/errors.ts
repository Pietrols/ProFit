// An error the API is allowed to show to the client. Anything that is not an AppError is
// treated as unexpected: logged in full, and answered with a generic 500.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const badRequest = (message: string) => new AppError(400, 'BAD_REQUEST', message);
