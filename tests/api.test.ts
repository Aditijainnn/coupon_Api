/*
 * API tests: real HTTP requests to the real Express app, backed by a real MongoDB.
 *
 * They read MONGODB_URI from .env, but always switch to a separate database called
 * "coupon_api_test" and delete its coupons before every test, so your real coupons are
 * never touched. Without MONGODB_URI the whole suite is skipped.
 */
import 'dotenv/config';

import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import app from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { Coupon } from '../src/models/Coupon';

const TEST_DATABASE = 'coupon_api_test';
const mongoUri = process.env.MONGODB_URI;

/** The JSON shapes the API returns. */
interface CouponJson {
  id: string;
  code: string;
  discount: number;
  expiresAt: string;
  isExpired: boolean;
  createdAt: string;
}
interface CreatedJson {
  message: string;
  coupon: CouponJson;
}
interface ListJson {
  coupons: CouponJson[];
}
interface AppliedJson {
  code: string;
  originalAmount: number;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
}
interface ErrorJson {
  message: string;
}
interface ApiResponse<T> {
  status: number;
  body: T;
}

/** An ISO date string `days` days from now, so the tests never depend on today's date. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('Coupon API', { skip: mongoUri ? false : 'MONGODB_URI is not set, so the API tests were skipped' }, () => {
  let server: Server;
  let baseUrl = '';

  /** Sends a request with a JSON body (if given) and returns the status code and parsed JSON. */
  async function send<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as T };
  }

  /** Sends a raw, unmodified body. Needed for malformed JSON and for values JSON.stringify can't produce. */
  async function sendRaw<T>(path: string, rawBody: string, contentType = 'application/json'): Promise<ApiResponse<T>> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: rawBody,
    });
    return { status: response.status, body: (await response.json()) as T };
  }

  /** Checks the status code and that the error message contains `messagePart`. */
  function assertError(response: ApiResponse<ErrorJson>, status: number, messagePart: string): void {
    assert.equal(response.status, status, `expected ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
    assert.ok(
      response.body.message.includes(messagePart),
      `expected "${response.body.message}" to include "${messagePart}"`,
    );
  }

  /** Creates a coupon through the API and checks that it worked. */
  async function createCoupon(code: string, discount: number, expiresAt = daysFromNow(30)): Promise<CouponJson> {
    const response = await send<CreatedJson>('POST', '/coupons', { code, discount, expiresAt });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body.coupon;
  }

  /** Saves an already-expired coupon straight to the database (the API itself refuses past dates). */
  async function insertCouponExpiringAt(code: string, expiresAt: Date): Promise<void> {
    await Coupon.create({ code, discount: 10, expiresAt });
  }

  before(async () => {
    await connectDatabase(mongoUri as string, TEST_DATABASE);
    await Coupon.init(); // make sure the unique index on `code` exists
    server = app.listen(0); // port 0 = any free port
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await Coupon.deleteMany({});
  });

  after(async () => {
    await Coupon.deleteMany({});
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
  });

  describe('POST /coupons', () => {
    test('creates a coupon (201) with a trimmed, uppercase code', async () => {
      const expiresAt = daysFromNow(30);
      const response = await send<CreatedJson>('POST', '/coupons', { code: '  save20 ', discount: 20, expiresAt });

      assert.equal(response.status, 201);
      assert.equal(response.body.message, 'Coupon created successfully');
      assert.equal(response.body.coupon.code, 'SAVE20');
      assert.equal(response.body.coupon.discount, 20);
      assert.equal(response.body.coupon.expiresAt, expiresAt);
      assert.equal(response.body.coupon.isExpired, false);
      assert.match(response.body.coupon.id, /^[0-9a-f]{24}$/);
    });

    test('accepts the boundary discounts 1 and 90', async () => {
      assert.equal((await createCoupon('ONE', 1)).discount, 1);
      assert.equal((await createCoupon('NINETY', 90)).discount, 90);
    });

    test('rejects a duplicate code, ignoring letter case (409)', async () => {
      await createCoupon('SAVE20', 20);
      const response = await send<ErrorJson>('POST', '/coupons', {
        code: 'save20',
        discount: 30,
        expiresAt: daysFromNow(10),
      });
      assertError(response, 409, 'Coupon code "SAVE20" already exists');
    });

    const valid = { code: 'SAVE20', discount: 20, expiresAt: daysFromNow(30) };
    const invalidBodies: { name: string; body: Record<string, unknown>; message: string }[] = [
      { name: 'a missing code', body: { ...valid, code: undefined }, message: 'code is required' },
      { name: 'an empty code', body: { ...valid, code: '   ' }, message: 'code cannot be empty' },
      { name: 'a code that is not a string', body: { ...valid, code: 123 }, message: 'code must be a string' },
      { name: 'a missing discount', body: { ...valid, discount: undefined }, message: 'discount is required' },
      { name: 'a discount below 1', body: { ...valid, discount: 0 }, message: 'between 1 and 90' },
      { name: 'a discount above 90', body: { ...valid, discount: 91 }, message: 'between 1 and 90' },
      { name: 'a discount sent as a string', body: { ...valid, discount: '20' }, message: 'discount must be a number' },
      { name: 'a fractional discount', body: { ...valid, discount: 12.5 }, message: 'whole number' },
      { name: 'a missing expiry date', body: { ...valid, expiresAt: undefined }, message: 'expiresAt is required' },
      { name: 'an invalid expiry date', body: { ...valid, expiresAt: 'not-a-date' }, message: 'expiresAt is not a valid date' },
      { name: 'an impossible expiry date', body: { ...valid, expiresAt: '2030-02-30' }, message: 'does not exist' },
      { name: 'an expiry date in the past', body: { ...valid, expiresAt: daysFromNow(-1) }, message: 'must be in the future' },
    ];
    for (const { name, body, message } of invalidBodies) {
      test(`rejects ${name} (400)`, async () => {
        assertError(await send<ErrorJson>('POST', '/coupons', body), 400, message);
      });
    }

    test('rejects malformed JSON (400)', async () => {
      assertError(await sendRaw<ErrorJson>('/coupons', '{"code": "SAVE20", "discount": '), 400, 'invalid JSON');
    });

    test('rejects a body that is not sent as JSON (400)', async () => {
      const response = await sendRaw<ErrorJson>('/coupons', 'code=SAVE20', 'text/plain');
      assertError(response, 400, 'Request body must be a JSON object');
    });

    test('does not save anything when the input is invalid', async () => {
      await send<ErrorJson>('POST', '/coupons', { ...valid, discount: 95 });
      assert.equal(await Coupon.countDocuments(), 0);
    });
  });

  describe('GET /coupons', () => {
    test('returns an empty array when there are no coupons (200)', async () => {
      const response = await send<ListJson>('GET', '/coupons');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { coupons: [] });
    });

    test('lists all coupons newest first, including expired ones flagged with isExpired (200)', async () => {
      await insertCouponExpiringAt('OLD10', new Date(Date.now() - 60_000));
      await createCoupon('SAVE20', 20);

      const response = await send<ListJson>('GET', '/coupons');
      assert.equal(response.status, 200);
      assert.deepEqual(
        response.body.coupons.map((coupon) => [coupon.code, coupon.isExpired]),
        [
          ['SAVE20', false],
          ['OLD10', true],
        ],
      );
    });
  });

  describe('POST /coupons/apply', () => {
    beforeEach(async () => {
      await createCoupon('SAVE20', 20);
    });

    test('applies a coupon and returns the calculation (200)', async () => {
      const response = await send<AppliedJson>('POST', '/coupons/apply', { code: 'SAVE20', amount: 1000 });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        code: 'SAVE20',
        originalAmount: 1000,
        discountPercent: 20,
        discountAmount: 200,
        finalAmount: 800,
      });
    });

    test('matches the code regardless of letter case and surrounding spaces', async () => {
      const response = await send<AppliedJson>('POST', '/coupons/apply', { code: ' save20 ', amount: 50 });
      assert.equal(response.status, 200);
      assert.equal(response.body.code, 'SAVE20');
      assert.equal(response.body.finalAmount, 40);
    });

    test('accepts an amount of 0', async () => {
      const response = await send<AppliedJson>('POST', '/coupons/apply', { code: 'SAVE20', amount: 0 });
      assert.equal(response.status, 200);
      assert.equal(response.body.discountAmount, 0);
      assert.equal(response.body.finalAmount, 0);
    });

    test('rounds money to 2 decimal places', async () => {
      await createCoupon('FIFTEEN', 15);
      const response = await send<AppliedJson>('POST', '/coupons/apply', { code: 'FIFTEEN', amount: 999.99 });
      assert.equal(response.status, 200);
      assert.equal(response.body.discountAmount, 150);
      assert.equal(response.body.finalAmount, 849.99);
    });

    test('returns 404 for a code that does not exist', async () => {
      const response = await send<ErrorJson>('POST', '/coupons/apply', { code: 'NOPE', amount: 1000 });
      assertError(response, 404, 'Coupon "NOPE" not found');
    });

    test('returns 400 for an expired coupon', async () => {
      await insertCouponExpiringAt('OLD10', new Date(Date.now() - 60_000));
      const response = await send<ErrorJson>('POST', '/coupons/apply', { code: 'OLD10', amount: 1000 });
      assertError(response, 400, 'Coupon "OLD10" has expired');
    });

    test('treats a coupon that expires at the current moment as expired', async () => {
      await insertCouponExpiringAt('NOW10', new Date());
      const response = await send<ErrorJson>('POST', '/coupons/apply', { code: 'NOW10', amount: 1000 });
      assertError(response, 400, 'has expired');
    });

    const invalidAmounts: { name: string; body: Record<string, unknown>; message: string }[] = [
      { name: 'a missing amount', body: { code: 'SAVE20' }, message: 'amount is required' },
      { name: 'a null amount', body: { code: 'SAVE20', amount: null }, message: 'amount is required' },
      { name: 'a negative amount', body: { code: 'SAVE20', amount: -100 }, message: 'amount cannot be negative' },
      { name: 'an amount sent as a string', body: { code: 'SAVE20', amount: '1000' }, message: 'amount must be a number' },
      { name: 'an amount sent as a boolean', body: { code: 'SAVE20', amount: true }, message: 'amount must be a number' },
      { name: 'an amount with 3 decimals', body: { code: 'SAVE20', amount: 10.555 }, message: 'at most 2 decimal places' },
      { name: 'a missing code', body: { amount: 1000 }, message: 'code is required' },
      { name: 'an empty code', body: { code: '', amount: 1000 }, message: 'code cannot be empty' },
    ];
    for (const { name, body, message } of invalidAmounts) {
      test(`rejects ${name} (400)`, async () => {
        assertError(await send<ErrorJson>('POST', '/coupons/apply', body), 400, message);
      });
    }

    test('rejects an infinite amount (400)', async () => {
      // JSON can't contain Infinity, but 1e400 is too big for a number, so JSON.parse turns it into Infinity.
      const response = await sendRaw<ErrorJson>('/coupons/apply', '{"code": "SAVE20", "amount": 1e400}');
      assertError(response, 400, 'amount must be a number');
    });

    test('rejects malformed JSON (400)', async () => {
      assertError(await sendRaw<ErrorJson>('/coupons/apply', '{code: SAVE20}'), 400, 'invalid JSON');
    });
  });

  describe('other routes', () => {
    test('GET /health reports a connected database (200)', async () => {
      const response = await send<{ status: string; database: string }>('GET', '/health');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { status: 'ok', database: 'connected' });
    });

    test('unknown routes return a JSON 404', async () => {
      assertError(await send<ErrorJson>('GET', '/nope'), 404, 'Route GET /nope not found');
    });
  });

  describe('when MongoDB is unavailable', () => {
    test('answers 503 instead of hanging or crashing, and recovers after reconnecting', async () => {
      await disconnectDatabase();
      try {
        assertError(await send<ErrorJson>('GET', '/coupons'), 503, 'Database is unavailable');
        assertError(
          await send<ErrorJson>('POST', '/coupons/apply', { code: 'SAVE20', amount: 1000 }),
          503,
          'Database is unavailable',
        );
        const health = await send<{ status: string; database: string }>('GET', '/health');
        assert.equal(health.status, 503);
        assert.deepEqual(health.body, { status: 'unavailable', database: 'disconnected' });
      } finally {
        await connectDatabase(mongoUri as string, TEST_DATABASE);
      }
      assert.equal((await send<ListJson>('GET', '/coupons')).status, 200);
    });
  });
});
