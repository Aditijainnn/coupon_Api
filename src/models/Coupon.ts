import { Schema, model, type HydratedDocument } from 'mongoose';

// Business limits, shared by the request validation (utils/validation.ts) and the schema below.
export const MIN_DISCOUNT = 1;
export const MAX_DISCOUNT = 90;
export const MAX_CODE_LENGTH = 50;

/** A coupon as it is stored in MongoDB. */
export interface ICoupon {
  /** Always trimmed and uppercase, e.g. "SAVE20". Unique across all coupons. */
  code: string;
  /** Whole-number percentage between MIN_DISCOUNT and MAX_DISCOUNT, e.g. 20 means 20% off. */
  discount: number;
  /** The coupon stops working at this moment (stored in UTC). */
  expiresAt: Date;
  /** Set automatically by Mongoose (see the `timestamps` option below). */
  createdAt: Date;
}

/** A coupon loaded from MongoDB, with Mongoose's document methods and an `_id`. */
export type CouponDocument = HydratedDocument<ICoupon>;

/*
 * The routes validate every request before it reaches the database. The schema rules below
 * repeat the important ones as a second line of defence, so invalid data can never be
 * saved, even by code that forgets to validate first.
 */
const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: [true, 'code is required'],
      trim: true,
      uppercase: true,
      maxlength: [MAX_CODE_LENGTH, `code cannot be longer than ${MAX_CODE_LENGTH} characters`],
      // `unique` creates a unique index in MongoDB, so the database itself rejects a second
      // coupon with the same code (error code 11000), even if two requests arrive at once.
      unique: true,
    },
    discount: {
      type: Number,
      required: [true, 'discount is required'],
      min: [MIN_DISCOUNT, `discount must be between ${MIN_DISCOUNT} and ${MAX_DISCOUNT}`],
      max: [MAX_DISCOUNT, `discount must be between ${MIN_DISCOUNT} and ${MAX_DISCOUNT}`],
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: 'discount must be a whole number',
      },
    },
    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
    },
  },
  {
    // Coupons are never edited, so only `createdAt` is useful (no `updatedAt`).
    timestamps: { createdAt: true, updatedAt: false },
    // Drop Mongoose's internal `__v` version field; nothing here needs it.
    versionKey: false,
  },
);

export const Coupon = model<ICoupon>('Coupon', couponSchema);

/**
 * A coupon is expired when its expiry time is at or before `now`.
 * So a coupon that expires exactly "now" already counts as expired.
 * `now` is a parameter so tests can check that exact boundary.
 */
export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
