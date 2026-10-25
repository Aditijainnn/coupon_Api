/*
 * Calls to the Coupon API. The paths are relative (/coupons, /health): during development
 * Vite forwards them to the API on http://localhost:3000 (see vite.config.ts).
 */

/** A coupon as the API returns it. */
export interface Coupon {
  id: string;
  code: string;
  discount: number;
  expiresAt: string;
  isExpired: boolean;
  createdAt: string;
}

export interface NewCoupon {
  code: string;
  discount: number;
  /** ISO date. Left out when the expiry field is empty, so the API can say it's required. */
  expiresAt?: string;
}

export interface AppliedCoupon {
  code: string;
  originalAmount: number;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
}

interface Health {
  status: 'ok' | 'unavailable';
  database: 'connected' | 'disconnected';
}

/** An error whose message can be shown on the page as it is. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const API_UNREACHABLE =
  "Can't reach the Coupon API. Start it with npm run dev in the coupon-api folder, then try again.";

function hasMessage(data: unknown): data is { message: string } {
  return typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string';
}

/** GET when there is no body, POST with a JSON body otherwise. Throws ApiError with the API's message. */
async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      path,
      body === undefined
        ? undefined
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
  } catch {
    throw new ApiError(0, API_UNREACHABLE);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // The API always answers errors with { "message": "..." }. Anything else means the request
    // never reached it (for example Vite's proxy failing because the API isn't running).
    throw new ApiError(response.status, hasMessage(data) ? data.message : API_UNREACHABLE);
  }
  return data as T;
}

export async function listCoupons(): Promise<Coupon[]> {
  const data = await request<{ coupons: Coupon[] }>('/coupons');
  return data.coupons;
}

export async function createCoupon(input: NewCoupon): Promise<Coupon> {
  const data = await request<{ message: string; coupon: Coupon }>('/coupons', input);
  return data.coupon;
}

export function applyCoupon(code: string, amount: number | undefined): Promise<AppliedCoupon> {
  return request<AppliedCoupon>('/coupons/apply', { code, amount });
}

/** The API's health, or null when the API can't be reached at all. */
export async function getHealth(): Promise<Health | null> {
  try {
    const response = await fetch('/health');
    const data: unknown = await response.json();
    return typeof data === 'object' && data !== null && 'database' in data ? (data as Health) : null;
  } catch {
    return null;
  }
}
