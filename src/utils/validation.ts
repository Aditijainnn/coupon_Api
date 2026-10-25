import { MAX_CODE_LENGTH, MAX_DISCOUNT, MIN_DISCOUNT } from '../models/Coupon';
import { HttpError } from './httpError';

/*
 * Request validation.
 *
 * Values from a request body are `unknown` until they have been checked. Types are checked
 * explicitly with `typeof` instead of converting values first, because JavaScript's automatic
 * conversions would accept bad input: Number("20") is 20, Number("") is 0, Number(null) is 0
 * and Number(true) is 1.
 *
 * Each function either returns clean, correctly typed data or throws an HttpError with
 * status 400 and a message that explains the problem.
 */

/** Largest order amount accepted. A sanity limit that also keeps all money arithmetic exact. */
export const MAX_AMOUNT = 1_000_000_000;

export interface CreateCouponInput {
  code: string;
  discount: number;
  expiresAt: Date;
}

export interface ApplyCouponInput {
  code: string;
  amount: number;
}

// Accepted expiresAt formats (ISO 8601):
//   "2026-12-31"                      a date on its own means midnight UTC at the start of that day
//   "2026-12-31T23:59:59Z"            a date and time in UTC (seconds and milliseconds are optional)
//   "2026-12-31T23:59:59+05:30"       a date and time with an offset from UTC
// Capture groups 1-3 are the year, month and day.
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

// A date and time with no timezone, e.g. "2026-12-31T23:59:59". JavaScript would read it in the
// server's local timezone, so the same request could mean different moments on different servers.
const ISO_DATE_WITHOUT_TIMEZONE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

const EXPIRES_AT_EXAMPLE = 'use ISO 8601 format, e.g. "2030-12-31T23:59:59Z"';

// At most two digits after the decimal point: "1000", "499.9" and "499.99" match, "1000.555" doesn't.
const AT_MOST_TWO_DECIMALS_PATTERN = /^\d+(\.\d{1,2})?$/;

function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null;
}

/** The body must be a JSON object like {"code": "SAVE20"}: not empty, not an array, not a plain value. */
function requireObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest(
      'Request body must be a JSON object. Send JSON with the header "Content-Type: application/json".',
    );
  }
  return body as Record<string, unknown>;
}

/** Day 0 of the next month is the last day of this month, e.g. Date.UTC(2026, 2, 0) is 28 Feb 2026. */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

/**
 * code: a non-empty string. It is trimmed and uppercased, so " save20" and "SAVE20" are the same
 * coupon. Both endpoints use this function, so codes are always normalised the same way.
 */
export function validateCode(value: unknown): string {
  if (isMissing(value)) {
    throw badRequest('code is required');
  }
  if (typeof value !== 'string') {
    throw badRequest('code must be a string');
  }

  const code = value.trim().toUpperCase();
  if (code === '') {
    throw badRequest('code cannot be empty');
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw badRequest(`code cannot be longer than ${MAX_CODE_LENGTH} characters`);
  }
  return code;
}

/** discount: a whole-number percentage from 1 to 90. */
export function validateDiscount(value: unknown): number {
  if (isMissing(value)) {
    throw badRequest('discount is required');
  }
  // `typeof` rejects strings such as "20"; Number.isFinite rejects NaN and Infinity.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw badRequest('discount must be a number');
  }
  if (!Number.isInteger(value) || value < MIN_DISCOUNT || value > MAX_DISCOUNT) {
    throw badRequest(`discount must be a whole number between ${MIN_DISCOUNT} and ${MAX_DISCOUNT}`);
  }
  return value;
}

/** expiresAt: an ISO 8601 date string for a real calendar date that is later than `now`. */
export function validateExpiresAt(value: unknown, now: Date = new Date()): Date {
  if (isMissing(value)) {
    throw badRequest('expiresAt is required');
  }
  if (typeof value !== 'string') {
    throw badRequest(`expiresAt must be a date string: ${EXPIRES_AT_EXAMPLE}`);
  }

  const text = value.trim();
  if (text === '') {
    throw badRequest('expiresAt cannot be empty');
  }
  if (ISO_DATE_WITHOUT_TIMEZONE_PATTERN.test(text)) {
    throw badRequest(
      'expiresAt must include a timezone, e.g. "2030-12-31T23:59:59Z" (UTC) or "2030-12-31T23:59:59+05:30"',
    );
  }

  const match = ISO_DATE_PATTERN.exec(text);
  const date = new Date(text);
  if (match === null || Number.isNaN(date.getTime())) {
    throw badRequest(`expiresAt is not a valid date: ${EXPIRES_AT_EXAMPLE}`);
  }

  // JavaScript silently rolls impossible dates forward (2026-02-30 becomes 2026-03-02),
  // so check that the year, month and day in the string really exist.
  const [, year, month, day] = match;
  if (!isRealCalendarDate(Number(year), Number(month), Number(day))) {
    throw badRequest(`expiresAt is not a valid date: ${year}-${month}-${day} does not exist`);
  }

  if (date.getTime() <= now.getTime()) {
    throw badRequest('expiresAt must be in the future');
  }
  return date;
}

/** amount: a money value of 0 or more with at most 2 decimal places, e.g. 1000 or 499.99. */
export function validateAmount(value: unknown): number {
  if (isMissing(value)) {
    throw badRequest('amount is required');
  }
  // `typeof` rejects strings such as "1000"; Number.isFinite rejects NaN and Infinity.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw badRequest('amount must be a number');
  }
  if (value < 0) {
    throw badRequest('amount cannot be negative');
  }
  if (value > MAX_AMOUNT) {
    throw badRequest(`amount cannot be greater than ${MAX_AMOUNT}`);
  }
  // String(499.99) is "499.99" and String(1000.555) is "1000.555", so count the digits after the point.
  if (!AT_MOST_TWO_DECIMALS_PATTERN.test(String(value))) {
    throw badRequest('amount can have at most 2 decimal places');
  }
  return value;
}

/** Validates the body of POST /coupons. Fields are checked in order and the first problem is reported. */
export function validateCreateCouponInput(body: unknown, now: Date = new Date()): CreateCouponInput {
  const data = requireObject(body);
  return {
    code: validateCode(data.code),
    discount: validateDiscount(data.discount),
    expiresAt: validateExpiresAt(data.expiresAt, now),
  };
}

/** Validates the body of POST /coupons/apply. */
export function validateApplyCouponInput(body: unknown): ApplyCouponInput {
  const data = requireObject(body);
  return {
    code: validateCode(data.code),
    amount: validateAmount(data.amount),
  };
}
