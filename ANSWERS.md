# Part 2: Bug analysis

## The route under review

```ts
app.post("/apply", async (req, res) => {
  const coupon = await Coupon.findOne({ code: req.body.code });
  if (coupon.expiresAt < new Date()) {
    return res.status(400).json({ message: "Expired" });
  }
  const finalAmount = req.body.amount - req.body.amount * coupon.discount / 100;
  res.json({ finalAmount });
});
```

The route should take `{ code, amount }`, find the coupon, refuse it if it doesn't exist or has
expired, reject an amount that is missing, negative or not a number, and return the amount after
the discount.

**How these findings were checked.** I ran this exact route on Express 4 and on Express 5, with a
stand-in `Coupon.findOne` (no database), and sent the requests shown in the tables below. The
outputs are copied from those runs. The corrected route at the end was also run against every
case, using this project's real Mongoose model.

## Findings

Ordered by severity. Findings 1 and 2 break the assignment's explicit requirements.

### 1. Unknown coupon codes crash the route (no `null` check)

- **Problem:** `Coupon.findOne()` returns `null` when no coupon has that code. The next line reads
  `coupon.expiresAt`, which throws `TypeError: Cannot read properties of null (reading 'expiresAt')`.
- **Impact:** what happens next depends on the Express version:

  | Request | Express 4 | Express 5 |
  | --- | --- | --- |
  | `{"code":"NOPE","amount":1000}` | **The whole server process exits** (unhandled promise rejection, Node 15+). Without that, the request would hang forever. | `500` with Express's default **HTML error page, including a stack trace** outside production. |

  The assignment requires a clear error for an unknown code. Either way, the client never gets one,
  and on Express 4 a single bad request takes the API down for every user.
- **Fix:** check the result before using it, and answer `404`:
  ```ts
  if (!coupon) {
    return res.status(404).json({ message: `Coupon "${code}" not found` });
  }
  ```
- **Severity:** High

### 2. The amount isn't validated at all

- **Problem:** `req.body.amount` is used directly in arithmetic. JavaScript converts whatever it
  gets into a number (type coercion), so invalid input produces a result instead of an error.
- **Impact:** every one of these returns `200 OK`:

  | `amount` sent | Response |
  | --- | --- |
  | missing | `{"finalAmount":null}` (`NaN`, which JSON turns into `null`) |
  | `"abc"` | `{"finalAmount":null}` |
  | `-500` | `{"finalAmount":-400}`, a negative price |
  | `null` | `{"finalAmount":0}` |
  | `true` | `{"finalAmount":0.8}` |
  | `"1000"` or `[1000]` | `{"finalAmount":800}`, a string or array silently accepted |

  The assignment requires a clear error when the amount is missing, negative or not a number.
- **Fix:** validate before calculating, without coercion:
  ```ts
  if (amount === undefined || amount === null) return res.status(400).json({ message: 'amount is required' });
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return res.status(400).json({ message: 'amount must be a number' });
  if (amount < 0) return res.status(400).json({ message: 'amount cannot be negative' });
  ```
  `Number.isFinite` also rejects `Infinity`, which a client can send as `1e400` (JSON parses it as
  `Infinity`).
- **Severity:** High

### 3. Database errors aren't handled (Express 4)

- **Problem:** `await Coupon.findOne(...)` rejects if MongoDB is down or times out. Express 4 does
  not catch errors from `async` handlers.
- **Impact:** on Express 4 the result is the same as finding 1: an unhandled rejection, which
  exits the process. I ran this with the database "down", and the request got no response.
  Express 5 forwards rejected promises to the error handler automatically, so there the client gets
  a `500` instead.
- **Fix:** on Express 4, wrap the handler in `try/catch` and call `next(error)`, or use a small
  async wrapper. On Express 5 that's built in. Either way, add an error handler that returns JSON
  such as `{ "message": "Internal server error" }` and logs the details only on the server. A
  `503` is reasonable for a known "database unavailable" error.
- **Severity:** High on Express 4, Low on Express 5

### 4. `code` isn't validated (NoSQL operator injection)

- **Problem:** `req.body.code` goes straight into the query. If a client sends an object instead of
  a string, MongoDB reads it as a query operator. Mongoose doesn't block this by default
  (`sanitizeFilter` is off).
- **Impact:** `{"code": {"$ne": null}, "amount": 1000}` means "any coupon whose code is not null", so
  it matches the first coupon in the collection and applies a discount the client never had. My
  stand-in imitated MongoDB's behaviour here, and the route returned `200 {"finalAmount":800}`. A
  missing or empty code is also sent to the database instead of being rejected.
- **Fix:** require a non-empty string before querying:
  ```ts
  if (typeof code !== 'string' || code.trim() === '') {
    return res.status(400).json({ message: 'code is required and must be a non-empty string' });
  }
  ```
- **Severity:** High

### 5. A missing request body crashes the route

- **Problem:** `req.body.code` assumes `req.body` exists. In Express 5, `req.body` is `undefined`
  when the request has no JSON body (for example a missing `Content-Type: application/json`
  header), or when no JSON middleware is installed.
- **Impact:** `TypeError: Cannot read properties of undefined (reading 'code')`, which leads to the
  same crash or 500 as finding 1. Malformed JSON is handled earlier by `express.json()`, which
  answers `400` by itself if it is installed. The snippet alone doesn't show the app's middleware
  setup, so this depends on it.
- **Fix:** read the body defensively, `const { code, amount } = req.body ?? {};`, and make sure
  `app.use(express.json())` is registered.
- **Severity:** Medium

### 6. A coupon that expires exactly "now" is accepted

- **Problem:** `coupon.expiresAt < new Date()` treats a coupon as valid at the exact moment it
  expires.
- **Impact:** an off-by-one at the boundary. "Expires at 23:59:59" should mean it no longer works at
  23:59:59.
- **Fix:** `if (coupon.expiresAt.getTime() <= Date.now())`. This is safe if the schema guarantees
  `expiresAt` is a required `Date`. If it weren't, a missing value would make the comparison
  `undefined < date`, which is `false`, so the coupon would never expire. The schema should make it
  required.
- **Severity:** Low to Medium

### 7. Money isn't rounded

- **Problem:** the formula itself is correct, but floating-point arithmetic doesn't produce exact
  money values.
- **Impact:** `20%` off `19.99` returns `{"finalAmount":15.991999999999999}`. That isn't a valid
  price and is awkward for any client to display or charge.
- **Fix:** calculate in whole cents and round once, with a documented rule:
  ```ts
  const amountInCents = Math.round(amount * 100);
  const discountInCents = Math.round((amountInCents * coupon.discount) / 100);
  const finalAmount = (amountInCents - discountInCents) / 100; // 15.99
  ```
- **Severity:** Low to Medium

### 8. Vague responses

- **Problem:** errors say only `"Expired"`, and a success returns only `finalAmount`.
- **Impact:** the client can't tell which coupon expired, or what discount was applied. With the
  crash in finding 1, there's also no "not found" message at all.
- **Fix:** use specific messages (`Coupon "SAVE20" has expired`) and return the calculation:
  `code`, `originalAmount`, `discountPercent`, `discountAmount` and `finalAmount`.
- **Severity:** Low

### 9. Code matching is case- and space-sensitive

- **Problem:** the code is searched for exactly as sent, so `"save20"` or `" SAVE20"` doesn't find
  `SAVE20`. On Express 4 that becomes the crash from finding 1, because the lookup returns `null`.
- **Impact:** this is a consistency issue rather than a definite bug. It matters if codes are meant
  to be case-insensitive, which users usually expect.
- **Fix:** trim and uppercase the code both when creating and when applying coupons
  (`code.trim().toUpperCase()`), and enforce uniqueness with a unique index on the normalised code.
- **Severity:** Low

### 10. The stored discount is trusted

- **Problem:** the route assumes `coupon.discount` is a number between 1 and 90.
- **Impact:** only a problem if the database can contain bad data. A missing discount would give
  `NaN`, and a value over 100 would give a negative price. If the schema enforces
  `min: 1, max: 90, required: true`, which it should, no extra check is needed in this route.
- **Fix:** enforce the range in the Mongoose schema and in the create endpoint, so the apply route
  can trust stored coupons.
- **Severity:** Low (depends on the schema)

## Corrected implementation

This assumes Express 5 and a Mongoose model whose `code` is a unique, uppercase string, `discount` is
a required number from 1 to 90, and `expiresAt` is a required `Date`. The `try/catch` makes it
correct on Express 4 as well.

```ts
app.use(express.json());

app.post('/apply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, amount } = (req.body ?? {}) as { code?: unknown; amount?: unknown };

    // 1. Validate the input before touching the database.
    if (typeof code !== 'string' || code.trim() === '') {
      return res.status(400).json({ message: 'code is required and must be a non-empty string' });
    }
    if (amount === undefined || amount === null) {
      return res.status(400).json({ message: 'amount is required' });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return res.status(400).json({ message: 'amount must be a number' });
    }
    if (amount < 0) {
      return res.status(400).json({ message: 'amount cannot be negative' });
    }

    // 2. Look the coupon up, normalised the same way as when coupons are created.
    const normalisedCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: normalisedCode });
    if (!coupon) {
      return res.status(404).json({ message: `Coupon "${normalisedCode}" not found` });
    }

    // 3. A coupon is expired when its expiry time is at or before now.
    if (coupon.expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: `Coupon "${normalisedCode}" has expired` });
    }

    // 4. Calculate in whole cents so the results have at most 2 decimal places.
    const amountInCents = Math.round(amount * 100);
    const discountInCents = Math.round((amountInCents * coupon.discount) / 100);
    const finalInCents = amountInCents - discountInCents;

    return res.status(200).json({
      code: coupon.code,
      originalAmount: amount,
      discountPercent: coupon.discount,
      discountAmount: discountInCents / 100,
      finalAmount: finalInCents / 100,
    });
  } catch (error) {
    return next(error); // database errors go to the error handler (needed in Express 4)
  }
});

// Error handler: log the details on the server, send the client a safe JSON message.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ message: 'Internal server error' });
});
```

Running the corrected route against the same requests:

| Request | Result |
| --- | --- |
| `{"code":"SAVE20","amount":1000}` | `200`, `finalAmount: 800` |
| `{"code":" save20 ","amount":1000}` | `200`, matched `SAVE20` |
| `{"code":"SAVE20","amount":19.99}` | `200`, `discountAmount: 4`, `finalAmount: 15.99` |
| `{"code":"NOPE","amount":1000}` | `404 Coupon "NOPE" not found` |
| an expired coupon | `400 Coupon "OLD10" has expired` |
| amount missing or `null` | `400 amount is required` |
| amount `"1000"`, `true` or `1e400` | `400 amount must be a number` |
| amount `-500` | `400 amount cannot be negative` |
| `{"code":{"$ne":null}}`, a missing code, or no body | `400 code is required and must be a non-empty string` |
| database down | `500 {"message":"Internal server error"}` |

## Assumptions and notes

- **Express version:** behaviour on errors differs (findings 1 and 3). The fix works on both.
- **Middleware:** malformed JSON and `req.body` handling depend on `express.json()` being
  registered, which the snippet doesn't show.
- **Schema:** findings 6 and 10 assume `expiresAt` and `discount` are required and range-checked by
  the Mongoose schema. If they aren't, the route needs to check them too.
- **Rounding rule:** the discount is rounded to the nearest cent (half a cent rounds up), and the
  final amount is the original minus the rounded discount, so the two always add up to the
  original.
- **Route path:** the assignment names the endpoint `POST /coupons/apply`. The snippet's `/apply`
  is correct if it's mounted on a `/coupons` router.
- The Part 1 implementation in this repository applies all of these fixes: see
  `src/routes/coupons.ts`, `src/utils/validation.ts` and `src/utils/discount.ts`.
