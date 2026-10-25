/*
 * Unit tests for the pure logic: request validation, the expiry rule and the money calculation.
 * They need no database and no server, so they always run.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isExpired } from '../src/models/Coupon';
import { calculateDiscount } from '../src/utils/discount';
import { HttpError } from '../src/utils/httpError';
import {
  MAX_AMOUNT,
  validateAmount,
  validateApplyCouponInput,
  validateCode,
  validateCreateCouponInput,
  validateDiscount,
  validateExpiresAt,
} from '../src/utils/validation';

/** Checks that `fn` throws a 400 HttpError whose message contains `expectedMessage`. */
function assertBadRequest(fn: () => unknown, expectedMessage: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof HttpError, 'expected an HttpError');
    assert.equal(error.statusCode, 400);
    assert.ok(
      error.message.includes(expectedMessage),
      `expected "${error.message}" to include "${expectedMessage}"`,
    );
    return true;
  });
}

describe('validateCode', () => {
  test('trims whitespace and converts to uppercase', () => {
    assert.equal(validateCode('  save20 '), 'SAVE20');
    assert.equal(validateCode('Save20'), 'SAVE20');
  });

  test('rejects a missing code', () => {
    assertBadRequest(() => validateCode(undefined), 'code is required');
    assertBadRequest(() => validateCode(null), 'code is required');
  });

  test('rejects a code that is not a string', () => {
    for (const value of [123, true, {}, ['SAVE20']]) {
      assertBadRequest(() => validateCode(value), 'code must be a string');
    }
  });

  test('rejects an empty or whitespace-only code', () => {
    assertBadRequest(() => validateCode(''), 'code cannot be empty');
    assertBadRequest(() => validateCode('   '), 'code cannot be empty');
  });

  test('accepts 50 characters and rejects 51', () => {
    assert.equal(validateCode('A'.repeat(50)), 'A'.repeat(50));
    assertBadRequest(() => validateCode('A'.repeat(51)), 'code cannot be longer than 50 characters');
  });
});

describe('validateDiscount', () => {
  test('accepts the boundaries 1 and 90 and values in between', () => {
    assert.equal(validateDiscount(1), 1);
    assert.equal(validateDiscount(20), 20);
    assert.equal(validateDiscount(90), 90);
  });

  test('rejects values below 1 or above 90', () => {
    for (const value of [0, -5, 91, 100]) {
      assertBadRequest(() => validateDiscount(value), 'discount must be a whole number between 1 and 90');
    }
  });

  test('rejects fractional percentages', () => {
    assertBadRequest(() => validateDiscount(12.5), 'discount must be a whole number between 1 and 90');
  });

  test('rejects values that are not real numbers, without type coercion', () => {
    for (const value of ['20', '', NaN, Infinity, -Infinity, true, {}, [20]]) {
      assertBadRequest(() => validateDiscount(value), 'discount must be a number');
    }
  });

  test('rejects a missing discount', () => {
    assertBadRequest(() => validateDiscount(undefined), 'discount is required');
    assertBadRequest(() => validateDiscount(null), 'discount is required');
  });
});

describe('validateExpiresAt', () => {
  // A fixed "now" makes these tests independent of the real date.
  const now = new Date('2026-06-01T12:00:00.000Z');

  test('accepts a future date and time in UTC', () => {
    const result = validateExpiresAt('2026-12-31T23:59:59.000Z', now);
    assert.equal(result.toISOString(), '2026-12-31T23:59:59.000Z');
  });

  test('accepts a timezone offset and converts it to UTC', () => {
    const result = validateExpiresAt('2026-12-31T23:59:59+05:30', now);
    assert.equal(result.toISOString(), '2026-12-31T18:29:59.000Z');
  });

  test('accepts a date on its own as midnight UTC at the start of that day', () => {
    const result = validateExpiresAt('2026-12-31', now);
    assert.equal(result.toISOString(), '2026-12-31T00:00:00.000Z');
  });

  test('rejects a missing expiry date', () => {
    assertBadRequest(() => validateExpiresAt(undefined, now), 'expiresAt is required');
    assertBadRequest(() => validateExpiresAt(null, now), 'expiresAt is required');
  });

  test('rejects an empty expiry date', () => {
    assertBadRequest(() => validateExpiresAt('', now), 'expiresAt cannot be empty');
    assertBadRequest(() => validateExpiresAt('   ', now), 'expiresAt cannot be empty');
  });

  test('rejects values that are not strings, such as timestamps', () => {
    assertBadRequest(() => validateExpiresAt(1798761599000, now), 'expiresAt must be a date string');
    assertBadRequest(() => validateExpiresAt(true, now), 'expiresAt must be a date string');
  });

  test('rejects text that is not an ISO 8601 date', () => {
    for (const value of ['not-a-date', '31/12/2026', 'December 31, 2026', '2026-13-01', '2026-12-31T25:00:00Z']) {
      assertBadRequest(() => validateExpiresAt(value, now), 'expiresAt is not a valid date');
    }
  });

  test('rejects calendar dates that do not exist', () => {
    assertBadRequest(() => validateExpiresAt('2026-02-30', now), '2026-02-30 does not exist');
    assertBadRequest(() => validateExpiresAt('2027-02-29T10:00:00Z', now), '2027-02-29 does not exist');
  });

  test('rejects a date and time without a timezone', () => {
    assertBadRequest(() => validateExpiresAt('2026-12-31T23:59:59', now), 'expiresAt must include a timezone');
  });

  test('rejects a date in the past', () => {
    assertBadRequest(() => validateExpiresAt('2026-05-31T12:00:00Z', now), 'expiresAt must be in the future');
  });

  test('rejects a date exactly equal to now, and accepts one millisecond later', () => {
    assertBadRequest(() => validateExpiresAt('2026-06-01T12:00:00.000Z', now), 'expiresAt must be in the future');
    assert.equal(
      validateExpiresAt('2026-06-01T12:00:00.001Z', now).toISOString(),
      '2026-06-01T12:00:00.001Z',
    );
  });
});

describe('validateAmount', () => {
  test('accepts zero, whole numbers and amounts with up to 2 decimal places', () => {
    for (const value of [0, 1000, 499.99, 0.5, MAX_AMOUNT]) {
      assert.equal(validateAmount(value), value);
    }
  });

  test('rejects a missing amount', () => {
    assertBadRequest(() => validateAmount(undefined), 'amount is required');
    assertBadRequest(() => validateAmount(null), 'amount is required');
  });

  test('rejects values that are not real numbers, without type coercion', () => {
    for (const value of ['1000', '', NaN, Infinity, -Infinity, true, [], {}]) {
      assertBadRequest(() => validateAmount(value), 'amount must be a number');
    }
  });

  test('rejects negative amounts', () => {
    assertBadRequest(() => validateAmount(-1), 'amount cannot be negative');
    assertBadRequest(() => validateAmount(-0.01), 'amount cannot be negative');
  });

  test('rejects amounts above the maximum', () => {
    assertBadRequest(() => validateAmount(MAX_AMOUNT + 1), `amount cannot be greater than ${MAX_AMOUNT}`);
  });

  test('rejects more than 2 decimal places', () => {
    assertBadRequest(() => validateAmount(10.555), 'amount can have at most 2 decimal places');
    assertBadRequest(() => validateAmount(0.001), 'amount can have at most 2 decimal places');
  });
});

describe('request body validation', () => {
  test('rejects bodies that are not JSON objects', () => {
    for (const body of [undefined, null, [], 'SAVE20', 42]) {
      assertBadRequest(() => validateCreateCouponInput(body), 'Request body must be a JSON object');
      assertBadRequest(() => validateApplyCouponInput(body), 'Request body must be a JSON object');
    }
  });

  test('returns clean, normalised data for a valid create request', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const input = validateCreateCouponInput({ code: ' save20 ', discount: 20, expiresAt: '2026-12-31T23:59:59Z' }, now);
    assert.deepEqual(input, { code: 'SAVE20', discount: 20, expiresAt: new Date('2026-12-31T23:59:59Z') });
  });

  test('returns clean, normalised data for a valid apply request', () => {
    assert.deepEqual(validateApplyCouponInput({ code: 'save20', amount: 1000 }), { code: 'SAVE20', amount: 1000 });
  });

  test('reports the first problem, checking fields in order', () => {
    assertBadRequest(() => validateCreateCouponInput({}), 'code is required');
    assertBadRequest(() => validateCreateCouponInput({ code: 'SAVE20' }), 'discount is required');
    assertBadRequest(() => validateApplyCouponInput({ code: 'SAVE20' }), 'amount is required');
  });
});

describe('isExpired', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  test('is true for a time in the past', () => {
    assert.equal(isExpired(new Date('2026-06-01T11:59:59.999Z'), now), true);
  });

  test('is true for a coupon that expires exactly now', () => {
    assert.equal(isExpired(new Date('2026-06-01T12:00:00.000Z'), now), true);
  });

  test('is false for a time in the future', () => {
    assert.equal(isExpired(new Date('2026-06-01T12:00:00.001Z'), now), false);
  });
});

describe('calculateDiscount', () => {
  test('calculates the example from the assignment: 20% off 1000', () => {
    assert.deepEqual(calculateDiscount(1000, 20), { discountAmount: 200, finalAmount: 800 });
  });

  test('works at the discount boundaries 1% and 90%', () => {
    assert.deepEqual(calculateDiscount(1000, 1), { discountAmount: 10, finalAmount: 990 });
    assert.deepEqual(calculateDiscount(1000, 90), { discountAmount: 900, finalAmount: 100 });
  });

  test('handles an amount of zero', () => {
    assert.deepEqual(calculateDiscount(0, 50), { discountAmount: 0, finalAmount: 0 });
  });

  test('rounds the discount to the nearest cent', () => {
    // 15% of 999.99 is 149.9985, which rounds to 150.00.
    assert.deepEqual(calculateDiscount(999.99, 15), { discountAmount: 150, finalAmount: 849.99 });
    // 33% of 10.01 is 3.3033, which rounds to 3.30.
    assert.deepEqual(calculateDiscount(10.01, 33), { discountAmount: 3.3, finalAmount: 6.71 });
  });

  test('rounds exactly half a cent up', () => {
    // 50% of 0.01 is 0.005.
    assert.deepEqual(calculateDiscount(0.01, 50), { discountAmount: 0.01, finalAmount: 0 });
  });

  test('avoids floating-point errors such as 0.1 + 0.2 = 0.30000000000000004', () => {
    // Plain floating-point maths gives 19.99 * 0.9 = 17.991000000000003 for the final amount.
    assert.deepEqual(calculateDiscount(19.99, 10), { discountAmount: 2, finalAmount: 17.99 });
  });

  test('discountAmount + finalAmount always adds up to the original amount', () => {
    for (let cents = 0; cents <= 20_000; cents += 7) {
      const amount = cents / 100;
      for (const discount of [1, 7, 15, 33, 50, 90]) {
        const { discountAmount, finalAmount } = calculateDiscount(amount, discount);
        assert.equal(Math.round(discountAmount * 100) + Math.round(finalAmount * 100), cents);
        assert.ok(finalAmount >= 0);
      }
    }
  });
});
