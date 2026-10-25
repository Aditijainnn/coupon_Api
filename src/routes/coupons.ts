import { Router } from 'express';
import { Coupon, isExpired, type CouponDocument } from '../models/Coupon';
import { calculateDiscount } from '../utils/discount';
import { HttpError } from '../utils/httpError';
import { validateApplyCouponInput, validateCreateCouponInput } from '../utils/validation';

const router = Router();

/** The JSON returned for a coupon. Choosing the fields by hand means internal fields never leak out. */
interface CouponResponse {
  id: string;
  code: string;
  discount: number;
  expiresAt: string;
  isExpired: boolean;
  createdAt: string;
}

function toCouponResponse(coupon: CouponDocument, now: Date): CouponResponse {
  return {
    id: coupon._id.toString(),
    code: coupon.code,
    discount: coupon.discount,
    expiresAt: coupon.expiresAt.toISOString(),
    isExpired: isExpired(coupon.expiresAt, now),
    createdAt: coupon.createdAt.toISOString(),
  };
}

/** MongoDB reports a violated unique index (here: a coupon code that already exists) with error code 11000. */
function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

/*
 * Express 5 automatically passes errors thrown inside async handlers (including rejected promises,
 * such as a failed database query) to the central error handler registered in app.ts.
 * That is why these handlers don't need try/catch blocks just to forward errors.
 */

/** POST /coupons: create a coupon. */
router.post('/', async (req, res) => {
  const input = validateCreateCouponInput(req.body);

  let coupon: CouponDocument;
  try {
    coupon = await Coupon.create(input);
  } catch (error) {
    // The unique index on `code` makes MongoDB reject duplicates, even when two requests
    // try to create the same code at the same moment.
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, `Coupon code "${input.code}" already exists`);
    }
    throw error;
  }

  res.status(201).json({
    message: 'Coupon created successfully',
    coupon: toCouponResponse(coupon, new Date()),
  });
});

/** GET /coupons: list all coupons, newest first. Expired coupons are included, flagged with isExpired: true. */
router.get('/', async (_req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1, _id: -1 });
  const now = new Date();

  res.status(200).json({
    coupons: coupons.map((coupon) => toCouponResponse(coupon, now)),
  });
});

/** POST /coupons/apply: check a coupon and calculate the order amount after the discount. */
router.post('/apply', async (req, res) => {
  const { code, amount } = validateApplyCouponInput(req.body);

  // `code` is a validated string, so a body like {"code": {"$ne": null}} can't be used to
  // inject a MongoDB query operator here.
  const coupon = await Coupon.findOne({ code });
  if (!coupon) {
    throw new HttpError(404, `Coupon "${code}" not found`);
  }
  if (isExpired(coupon.expiresAt)) {
    throw new HttpError(400, `Coupon "${code}" has expired`);
  }

  const { discountAmount, finalAmount } = calculateDiscount(amount, coupon.discount);

  res.status(200).json({
    code: coupon.code,
    originalAmount: amount,
    discountPercent: coupon.discount,
    discountAmount,
    finalAmount,
  });
});

export default router;
