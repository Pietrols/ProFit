import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError, notFound } from '../lib/errors.js';

// Every error leaves the API in one shape: { error: { code, message } }.
export type ErrorBody = { error: { code: string; message: string } };

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`No route for ${req.method} ${req.path}`));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let status = 500;
    let body: ErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } };

    if (err instanceof AppError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message } };
    } else if (isBodyParseError(err)) {
      status = 400;
      body = { error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } };
    } else if (isTooLarge(err)) {
      status = 413;
      body = { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' } };
    }

    if (status >= 500) logger.error({ err, method: req.method, path: req.path }, 'request failed');
    res.status(status).json(body);
  };
}

function isBodyParseError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
}

function isTooLarge(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large';
}
