/**
 * An error that already knows which HTTP status code and message the client should receive.
 * Validation and route code throw it; the central error handler (middleware/errorHandler.ts)
 * turns it into a JSON response such as { "message": "Coupon has expired" }.
 */
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}
