import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { HttpError } from '../utils/httpError';

export const DATABASE_UNAVAILABLE_MESSAGE = 'Database is unavailable. Please try again later.';

/** Error names the MongoDB driver and Mongoose use when the database cannot be reached. */
const DATABASE_UNAVAILABLE_ERRORS = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
]);

/** Errors thrown by express.json() (they come from the body-parser package) look like this. */
interface BodyParserError extends Error {
  status: number;
  type: string;
  expose?: boolean;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    error instanceof Error &&
    'type' in error &&
    typeof error.type === 'string' &&
    'status' in error &&
    typeof error.status === 'number'
  );
}

/** Works out the status code and a message that is safe to show the client for any error. */
function toErrorResponse(error: unknown): { statusCode: number; message: string } {
  // 1. Errors we threw on purpose: validation, coupon not found, expired, duplicate code, ...
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, message: error.message };
  }

  // 2. Errors from express.json(): malformed JSON, body too large, ...
  if (isBodyParserError(error)) {
    if (error.type === 'entity.parse.failed') {
      return { statusCode: 400, message: 'Request body contains invalid JSON' };
    }
    return { statusCode: error.status, message: error.expose ? error.message : 'Invalid request body' };
  }

  // 3. Mongoose schema validation. The routes validate input before saving, so this is a safety net.
  if (error instanceof mongoose.Error.ValidationError) {
    const firstProblem = Object.values(error.errors)[0];
    return { statusCode: 400, message: firstProblem?.message ?? 'Invalid coupon data' };
  }

  // 4. MongoDB is down or cannot be reached.
  if (error instanceof Error && DATABASE_UNAVAILABLE_ERRORS.has(error.name)) {
    return { statusCode: 503, message: DATABASE_UNAVAILABLE_MESSAGE };
  }

  // 5. Anything else is unexpected. Its details (stack trace, database messages) stay on the server.
  return { statusCode: 500, message: 'Internal server error' };
}

/**
 * Central error handler: every error ends up here and becomes a JSON response like
 * { "message": "Coupon has expired" }.
 *
 * Express recognises error-handling middleware by its four parameters, so `_next` must stay
 * even though it is only used in one case.
 */
export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  // If the response has already started, JSON can no longer be sent: let Express end the connection.
  if (res.headersSent) {
    next(error);
    return;
  }

  const { statusCode, message } = toErrorResponse(error);

  // Log unexpected server-side problems so they can be debugged. Clients only see the safe message.
  if (statusCode >= 500 && !(error instanceof HttpError)) {
    console.error(error);
  }

  res.status(statusCode).json({ message });
}

/** Answers requests to routes that don't exist with JSON instead of Express's default HTML page. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
}
