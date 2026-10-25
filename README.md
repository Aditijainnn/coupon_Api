# Coupon Management API

A REST API for creating discount coupons and applying them to an order amount. Built with
Node.js, Express 5, TypeScript and MongoDB (through Mongoose).

- `POST /coupons` creates a coupon with a code, a discount percent (1 to 90) and an expiry date.
- `GET /coupons` lists all coupons.
- `POST /coupons/apply` takes `{ code, amount }` and returns the amount after the discount, or a
  clear error when the coupon doesn't exist, has expired, or the amount is invalid.

a React page in [`client/`](#frontend-bonus-react-page) creates coupons, lists them and tries
them on an order.

![The React page: the new coupon form next to a live 3D preview of the coupon](docs/screenshots/live-preview-3d.png)

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation and setup](#installation-and-setup)
- [Running the API](#running-the-api)
- [Frontend (bonus React page)](#frontend-bonus-react-page)
- [Deploying to Vercel](#deploying-to-vercel)
- [API reference](#api-reference)
- [Status codes and errors](#status-codes-and-errors)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

## Features

- Three endpoints: create, list and apply coupons.
- Strict input validation with clear error messages. Values are type-checked, never coerced, so
  `"20"`, `true`, `null`, `NaN` and `Infinity` are rejected where a number is expected.
- Coupon codes are trimmed and uppercased, so `save20`, ` Save20 ` and `SAVE20` are the same coupon.
- Duplicate codes are prevented by a **unique index in MongoDB** (not just a check in code), so two
  requests arriving at the same moment still can't create the same code. Duplicates return `409`.
- Expired coupons stay visible in the list (flagged `"isExpired": true`) but can't be applied.
- Exact money calculation with a documented rounding policy (no floating-point surprises).
- Central error handling: every error becomes JSON like `{ "message": "..." }`. Stack traces,
  database errors and connection strings never reach the client.
- The server refuses to start without a database connection, and answers `503` (instead of hanging)
  if MongoDB goes down while it is running.
- Automated tests: unit tests for the logic and HTTP tests for every endpoint.
- Bonus React page with a live 3D coupon preview, an animated coupon list and a printed receipt.

## Tech stack

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 20.19 or newer | Runtime (required by Mongoose 9) |
| Express | 5 | Web framework. Version 5 forwards errors from `async` route handlers to the error handler automatically |
| TypeScript | 7 | Static types; compiled to plain JavaScript for production |
| MongoDB + Mongoose | Mongoose 9 | Persistent storage; schema, validation and the unique index |
| dotenv | 18 | Loads settings from the `.env` file |
| tsx | 4 | Runs the TypeScript directly during development (`npm run dev`) and in tests |

No other runtime dependencies. Validation is written by hand and tests use Node's built-in test runner.

## Project structure

```
coupon-api/
├── src/
│   ├── config/database.ts        # Connect to / disconnect from MongoDB
│   ├── models/Coupon.ts          # Mongoose schema, unique index, isExpired()
│   ├── routes/coupons.ts         # The three endpoints
│   ├── middleware/errorHandler.ts# Central error handler and JSON 404
│   ├── utils/httpError.ts        # HttpError: an error with an HTTP status code
│   ├── utils/validation.ts       # Request validation (code, discount, expiresAt, amount)
│   ├── utils/discount.ts         # Discount calculation and rounding
│   ├── app.ts                    # Express app: middleware, routes, /health
│   └── server.ts                 # Entry point: load .env, connect to MongoDB, then listen
├── tests/
│   ├── unit.test.ts              # Validation, expiry rule and calculation (no database needed)
│   ├── api.test.ts               # HTTP tests of every endpoint (needs MongoDB)
│   └── lazy-connection.test.ts   # The app connects on its first request, as on Vercel (needs MongoDB)
├── client/                       # Bonus React page (its own package.json, see below)
│   ├── src/api.ts                # Calls to the API
│   ├── src/App.tsx               # Page layout, loading coupons, API health check
│   ├── src/components/           # CouponCreator, CouponList, Ticket, TiltCard, OrderCheck, Receipt, ...
│   ├── src/styles.css            # All styles, with colour tokens at the top
│   └── vite.config.ts            # Dev server; forwards API requests to localhost:3000
├── docs/screenshots/             # Screenshots of the React page used in this README
├── .env.example                  # Template for .env (no real secrets)
├── .gitignore
├── package.json / package-lock.json
├── tsconfig.json                 # TypeScript settings (used by VS Code and `npm run typecheck`)
├── tsconfig.build.json           # Compiles src/ into dist/ (used by `npm run build`)
├── vercel.json                   # Vercel deployment: the page at /, the API at /coupons and /health
├── README.md
└── ANSWERS.md                    # Part 2 answers
```

`app.ts` only builds the Express app, and `server.ts` starts it. This split lets the tests run the
real app on a random port without starting the full server.

## Prerequisites

- **Node.js 20.19 or newer** (22 LTS or 24 LTS recommended). Check with `node -v`.
- **A MongoDB database**: a free MongoDB Atlas cluster, or MongoDB Community Server installed locally.
- Git, and optionally VS Code with the Thunder Client extension or Postman for manual testing.

## Installation and setup

The commands below are for **Windows PowerShell** (VS Code's default terminal on Windows). On macOS
or Linux, use the equivalent shown in the comments.

### 1. Get the code and install dependencies

```powershell
git clone <your-repository-url>
cd coupon-api
npm install
```

### 2. Create your `.env` file

```powershell
Copy-Item .env.example .env      # macOS/Linux: cp .env.example .env
```

Then open `.env` and set the two variables:

| Variable | Required | Example | Meaning |
| --- | --- | --- | --- |
| `PORT` | No (default `3000`) | `3000` | Port the API listens on |
| `MONGODB_URI` | **Yes** | `mongodb://127.0.0.1:27017/coupon_api` | MongoDB connection string, including the database name |

`.env` is in `.gitignore`, so your password is never committed. Only `.env.example`, which contains
placeholders, goes to GitHub.

### 3. Set up MongoDB

**Option A: MongoDB Atlas (cloud, free tier)**

1. Sign in at https://cloud.mongodb.com and create a free (M0) cluster.
2. **Database Access**: add a database user with a username and password and the
   "Read and write to any database" role.
3. **Network Access**: add your current IP address. Without this, the connection times out.
   For quick testing you can allow `0.0.0.0/0` (any IP), but remove it again afterwards.
4. **Connect → Drivers**: copy the connection string. It looks like
   `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`.
5. Put it in `.env`, insert the database name `coupon_api` after `.net/`, and replace the
   placeholders with your user's details:

   ```
   MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/coupon_api?retryWrites=true&w=majority
   ```

   If the password contains special characters such as `@`, `:`, `/` or `#`, URL-encode them
   (for example `@` becomes `%40`).

**Option B: local MongoDB**

1. Install MongoDB Community Server from https://www.mongodb.com/try/download/community
   (on Windows, keep "Install MongoD as a Service" ticked so it starts automatically).
2. Use `MONGODB_URI=mongodb://127.0.0.1:27017/coupon_api` (the value already in `.env.example`).

The database and the `coupons` collection are created automatically on first use, together with the
unique index on `code`.

## Running the API

### Development (auto-restarts when you save a file)

```powershell
npm run dev
```

Expected output:

```
Connected to MongoDB (database: "coupon_api")
Coupon API is running at http://localhost:3000
```

### Production

```powershell
npm run build    # type-checks and compiles src/*.ts into dist/*.js
npm start        # runs dist/server.js with plain Node.js
```

### Other scripts

| Command | What it does |
| --- | --- |
| `npm test` | Runs all automated tests (see [Testing](#testing)) |
| `npm run typecheck` | Type-checks the source and the tests without writing any files |

Stop the server with `Ctrl+C`: it finishes open requests, closes the database connection and exits.

### Health check

`GET http://localhost:3000/health` returns `200 {"status":"ok","database":"connected"}`, or `503` if
the database connection has been lost.

### Debugging in VS Code

Open the Command Palette (`Ctrl+Shift+P`), run **Debug: JavaScript Debug Terminal**, and run
`npm run dev` in that terminal. Breakpoints set in the `.ts` files are hit directly.

## Frontend (bonus React page)

`client/` is a separate React app (React 19, TypeScript, Vite) that uses the API:

- **New coupon:** a form next to a large 3D ticket that previews the coupon as you type and tilts
  towards the mouse. Creating the coupon spins the ticket, and the API's error messages (such as a
  duplicate code) appear under the button.
- **Your coupons:** every coupon from `GET /coupons` as a ticket, newest first. Expired coupons get
  an "Expired" stamp. "Try … on an order" fills in the order form below.
- **Check an order:** applies a coupon with `POST /coupons/apply` and prints a receipt. The price
  counts down to the final amount.
- A badge in the corner checks `GET /health` every 10 seconds and shows whether the API and the
  database are connected.

Run it in a **second terminal** while the API is running (`npm run dev` in the project folder):

```powershell
cd client
npm install
npm run dev
```

Then open http://localhost:5173. Vite forwards requests for `/coupons` and `/health` to the API on
`http://localhost:3000` (see `client/vite.config.ts`), so the API needs no CORS setup. If you
changed the API's `PORT`, change `API_URL` in that file too.

| Command (in `client/`) | What it does |
| --- | --- |
| `npm run dev` | Starts the page at http://localhost:5173 and reloads it when you save a file |
| `npm run build` | Type-checks and builds the page into `client/dist` |
| `npm run preview` | Serves the built page at http://localhost:4173 (the API must be running) |

Animations use the [Motion](https://motion.dev) library; the 3D effects are CSS 3D transforms. The
page follows the "reduce motion" setting of the operating system, supports light and dark mode, and
works on phone-sized screens.

### Screenshots

The screenshots use sample coupons.

**The whole page.** The form is filled in, so the big ticket previews `MONSOON25`.

![The whole page: the new coupon form, the coupon list and the order check](docs/screenshots/overview.png)

**Applying `SAVE20` to an order of 1,000.** The receipt prints and the price counts down to 800.

![A printed receipt: order amount 1,000.00, discount 200.00, to pay 800.00](docs/screenshots/receipt.png)

**The coupon list in dark mode.** The expired coupon has a stamp.

![Coupon tickets in dark mode, one stamped Expired](docs/screenshots/coupons-dark.png)

**On a phone**

<img src="docs/screenshots/mobile.png" alt="The page on a phone: the preview ticket above the form" width="320">

## Deploying to Vercel

The repository deploys to Vercel as **one project with two services**, configured in `vercel.json`:

| Service | What it is | Handles |
| --- | --- | --- |
| `web` | The React page in `client/` (Vite) | Everything else, starting with `/` |
| `api` | The Express API, entry point `src/app.ts` | `/coupons`, `/coupons/apply` and `/health` |

Both services share one address, so the page calls the API with the same paths it uses in
development (`/coupons`, `/health`). No CORS setup is needed.

1. **MongoDB Atlas:** go to **Network Access**, click **Add IP Address**, and choose
   **Allow access from anywhere** (`0.0.0.0/0`). Vercel's servers don't have fixed IP addresses,
   so a single IP isn't enough. The database password still protects the data.
2. **Vercel:** choose **Add New → Project** and import the GitHub repository. Vercel reads
   `vercel.json` and shows the **Services** preset with `web` and `api`.
3. **Environment variables:** add `MONGODB_URI` with the same connection string as in your `.env`.
   `PORT` isn't needed, because Vercel chooses the port.
4. Click **Deploy**, then open the deployment's address. The page's badge should say "API and
   database connected", and `/health` should return `{"status":"ok","database":"connected"}`.

**How the API runs on Vercel.** Vercel imports `src/app.ts` and runs it as a function, so
`src/server.ts` never runs and nothing connects to MongoDB at startup. Instead, the first request
opens the connection and later requests reuse it (`ensureDatabaseConnection` in
`src/config/database.ts`). `tests/lazy-connection.test.ts` checks this. Running locally works as
before: `server.ts` connects first, then starts the server.

## API reference

Base URL: `http://localhost:3000`. Request bodies must be JSON and sent with the header
`Content-Type: application/json`. Every response body is JSON.

### POST /coupons: create a coupon

Request:

```json
{
  "code": "SAVE20",
  "discount": 20,
  "expiresAt": "2030-12-31T23:59:59.000Z"
}
```

| Field | Rules |
| --- | --- |
| `code` | Required string, not empty, at most 50 characters. Trimmed and converted to uppercase. Must be unique (case-insensitive). |
| `discount` | Required number, a whole number from 1 to 90 (inclusive). Strings such as `"20"` are rejected. |
| `expiresAt` | Required ISO 8601 date string that is in the future, e.g. `"2030-12-31T23:59:59Z"` or `"2030-12-31T23:59:59+05:30"`. A date on its own (`"2030-12-31"`) means midnight UTC at the start of that day. A time without a timezone is rejected, as are impossible dates such as `"2030-02-30"`. |

Response `201 Created`:

```json
{
  "message": "Coupon created successfully",
  "coupon": {
    "id": "6650c3f2a1b2c3d4e5f60718",
    "code": "SAVE20",
    "discount": 20,
    "expiresAt": "2030-12-31T23:59:59.000Z",
    "isExpired": false,
    "createdAt": "2026-10-25T10:00:00.000Z"
  }
}
```

Errors: `400` for invalid input (see the messages in [Testing](#manual-test-plan)), and `409` with
`{"message": "Coupon code \"SAVE20\" already exists"}` for a duplicate code.

### GET /coupons: list all coupons

Response `200 OK`, newest first:

```json
{
  "coupons": [
    {
      "id": "6650c3f2a1b2c3d4e5f60718",
      "code": "SAVE20",
      "discount": 20,
      "expiresAt": "2030-12-31T23:59:59.000Z",
      "isExpired": false,
      "createdAt": "2026-10-25T10:00:00.000Z"
    }
  ]
}
```

With no coupons, the response is `{"coupons": []}`. **Expired coupons are included** so you can see
they exist, with `"isExpired": true`. They are still refused by `POST /coupons/apply`.

### POST /coupons/apply: apply a coupon to an order amount

Request:

```json
{
  "code": "SAVE20",
  "amount": 1000
}
```

| Field | Rules |
| --- | --- |
| `code` | Required non-empty string. Normalised the same way as when creating, so `save20` finds `SAVE20`. |
| `amount` | Required number, 0 or more, at most 2 decimal places, at most 1,000,000,000. Strings, `null`, booleans, `NaN` and `Infinity` are rejected. |

Response `200 OK`:

```json
{
  "code": "SAVE20",
  "originalAmount": 1000,
  "discountPercent": 20,
  "discountAmount": 200,
  "finalAmount": 800
}
```

Calculation:

```
discountAmount = amount × discount / 100     (rounded to 2 decimal places)
finalAmount    = amount − discountAmount
```

**Rounding policy:** the calculation is done in whole cents (or paise) with integer arithmetic. The
discount is rounded to the nearest cent, and exactly half a cent rounds up. The final amount is the
original minus the rounded discount, so `discountAmount + finalAmount` always equals the original
amount exactly. Example: 15% of `999.99` is `149.9985`, so the discount is `150` and the final amount
is `849.99`.

Errors:

| Status | When | Example message |
| --- | --- | --- |
| `400` | Invalid body, code or amount | `amount cannot be negative` |
| `404` | No coupon with that code | `Coupon "NOPE" not found` |
| `400` | The coupon has expired (its `expiresAt` is at or before the current time) | `Coupon "OLD10" has expired` |

## Status codes and errors

Every error response has the same shape:

```json
{ "message": "Coupon has expired" }
```

| Status | Meaning |
| --- | --- |
| `200` | Success (list, apply, health) |
| `201` | Coupon created |
| `400` | Invalid input: malformed JSON, missing fields, wrong types, values out of range, or an expired coupon |
| `404` | Coupon code not found, or unknown route |
| `409` | Duplicate coupon code |
| `413` | Request body larger than 10 kB |
| `500` | Unexpected server error (details are only logged on the server) |
| `503` | The database is unavailable |

## Testing

### Automated tests

```powershell
npm test
```

- `tests/unit.test.ts` always runs. It covers validation, the expiry rule and the money calculation,
  including all boundary cases.
- `tests/api.test.ts` sends real HTTP requests to the app, backed by MongoDB. It uses `MONGODB_URI`
  from `.env` but **always switches to a separate database, `coupon_api_test`**, whose coupons it
  deletes before each test, so your real data is never touched. Without `MONGODB_URI` this suite
  is skipped. It also checks that the API answers `503` when the database disconnects, and recovers
  after reconnecting.
- `tests/lazy-connection.test.ts` loads the app without `server.ts`, as Vercel does, and checks that
  the first request connects to MongoDB. It only calls `GET /health`, so no coupons are read or
  changed. Without `MONGODB_URI` it is skipped.

### Manual test plan

Start the server with `npm run dev`, then send these requests with Thunder Client, Postman,
PowerShell or curl (examples below). Run them in order: later tests rely on `SAVE20` existing.

**Successful requests**

| # | Request | Body | Expected status | Expected response / check |
| --- | --- | --- | --- | --- |
| S1 | `POST /coupons` | `{"code":"save20","discount":20,"expiresAt":"2030-12-31T23:59:59Z"}` | `201` | `message` is `Coupon created successfully`; `coupon.code` is `SAVE20` |
| S2 | `GET /coupons` | (none) | `200` | `coupons` contains `SAVE20` with `"isExpired": false` |
| S3 | `POST /coupons/apply` | `{"code":"SAVE20","amount":1000}` | `200` | `discountAmount` `200`, `finalAmount` `800` |

**Failing requests**

| # | Request | Body | Expected status | Expected message |
| --- | --- | --- | --- | --- |
| F1 | `POST /coupons` | `{"discount":20,"expiresAt":"2030-12-31T23:59:59Z"}` | `400` | `code is required` |
| F2 | `POST /coupons` | `{"code":"   ","discount":20,"expiresAt":"2030-12-31T23:59:59Z"}` | `400` | `code cannot be empty` |
| F3 | `POST /coupons` | `{"code":"Save20","discount":30,"expiresAt":"2030-12-31T23:59:59Z"}` | `409` | `Coupon code "SAVE20" already exists` |
| F4 | `POST /coupons` | `{"code":"LOW","discount":0,"expiresAt":"2030-12-31T23:59:59Z"}` | `400` | `discount must be a whole number between 1 and 90` |
| F5 | `POST /coupons` | `{"code":"HIGH","discount":91,"expiresAt":"2030-12-31T23:59:59Z"}` | `400` | `discount must be a whole number between 1 and 90` |
| F6 | `POST /coupons` | `{"code":"NODISC","expiresAt":"2030-12-31T23:59:59Z"}` | `400` | `discount is required` |
| F7 | `POST /coupons` | `{"code":"BADDATE","discount":10,"expiresAt":"not-a-date"}` | `400` | `expiresAt is not a valid date: use ISO 8601 format, e.g. "2030-12-31T23:59:59Z"` |
| F8 | `POST /coupons` | `{"code":"PAST","discount":10,"expiresAt":"2020-01-01T00:00:00Z"}` | `400` | `expiresAt must be in the future` |
| F9 | `POST /coupons/apply` | `{"code":"NOPE","amount":1000}` | `404` | `Coupon "NOPE" not found` |
| F10 | `POST /coupons/apply` | see "Expired coupon" below | `400` | `Coupon "SOON" has expired` |
| F11 | `POST /coupons/apply` | `{"code":"SAVE20"}` | `400` | `amount is required` |
| F12 | `POST /coupons/apply` | `{"code":"SAVE20","amount":-100}` | `400` | `amount cannot be negative` |
| F13 | `POST /coupons/apply` | `{"code":"SAVE20","amount":"1000"}` | `400` | `amount must be a number` |
| F14 | `POST /coupons/apply` | `{"code":"SAVE20","amount":` (malformed) | `400` | `Request body contains invalid JSON` |
| F15 | any `/coupons` request | stop MongoDB (or disconnect your network) while the server runs | `503` | `Database is unavailable. Please try again later.` |

If MongoDB is unreachable when the server **starts**, it prints
`Failed to start the Coupon API: Could not connect to MongoDB (...)` and exits without accepting
requests. To try it, set `MONGODB_URI=mongodb://127.0.0.1:1/coupon_api` in `.env` and run
`npm run dev`.

**Expired coupon (F10):** the API won't create a coupon whose date has already passed, so create one
that expires in about a minute, wait, then apply it. Generate a timestamp in PowerShell with
`(Get-Date).ToUniversalTime().AddMinutes(1).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")`, create
`{"code":"SOON","discount":10,"expiresAt":"<that value>"}`, wait a minute, then apply
`{"code":"SOON","amount":100}`.

**Boundary cases**

| # | Request | Body | Expected |
| --- | --- | --- | --- |
| B1 | `POST /coupons` | `{"code":"MIN1","discount":1,"expiresAt":"2030-12-31T23:59:59Z"}` | `201` (1 is allowed) |
| B2 | `POST /coupons` | `{"code":"MAX90","discount":90,"expiresAt":"2030-12-31T23:59:59Z"}` | `201` (90 is allowed) |
| B3 | `POST /coupons/apply` | `{"code":"SAVE20","amount":0}` | `200`, `discountAmount` `0`, `finalAmount` `0` |
| B4 | `POST /coupons/apply` | `{"code":"sAvE20","amount":50}` | `200`, `code` is `SAVE20` (letter case doesn't matter) |
| B5 | A coupon whose `expiresAt` equals the current time counts as expired. This is covered by the automated tests, since it can't be timed by hand. | | |

### Sending requests

**Thunder Client (VS Code) or Postman:** create a request, choose the method, enter the URL (for
example `http://localhost:3000/coupons`), and for POST requests open **Body → JSON** and paste the
body. Both tools set `Content-Type: application/json` for you.

**PowerShell:**

```powershell
# Create a coupon
$body = @{ code = "SAVE20"; discount = 20; expiresAt = "2030-12-31T23:59:59Z" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/coupons -ContentType "application/json" -Body $body

# List coupons
Invoke-RestMethod -Uri http://localhost:3000/coupons

# Apply a coupon
$body = @{ code = "SAVE20"; amount = 1000 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/coupons/apply -ContentType "application/json" -Body $body
```

For `4xx` and `5xx` responses, PowerShell shows the JSON error message as a red error. That is
expected.

**curl (Git Bash, macOS, Linux):**

```bash
curl -i -X POST http://localhost:3000/coupons \
  -H "Content-Type: application/json" \
  -d '{"code":"SAVE20","discount":20,"expiresAt":"2030-12-31T23:59:59Z"}'

curl -i http://localhost:3000/coupons

curl -i -X POST http://localhost:3000/coupons/apply \
  -H "Content-Type: application/json" \
  -d '{"code":"SAVE20","amount":1000}'
```

## Design decisions

- **Validation without type coercion.** Request values are checked with `typeof` before use,
  because JavaScript's automatic conversions accept bad input (`Number("") === 0`,
  `Number(null) === 0`, `Number(true) === 1`). Each validator either returns clean, typed data or
  throws an `HttpError(400, ...)`, and the first problem found is reported.
- **Codes are normalised** (trimmed and uppercased) in one shared function, used by both create and
  apply, so matching is always consistent. Validating `code` as a string also blocks NoSQL injection
  such as `{"code": {"$ne": null}}`.
- **Uniqueness comes from the database.** `code` has a unique index. Instead of "check, then insert"
  (which two simultaneous requests could both pass), the API inserts and turns MongoDB's
  duplicate-key error (code `11000`) into `409 Conflict`. The server waits for the index to exist
  before accepting requests.
- **Discount must be a whole-number percentage** from 1 to 90, as is usual for coupons
  ("20% off").
- **Expiry rule:** a coupon is expired when `expiresAt <= now`, so a coupon that expires exactly now
  is already expired. Dates are stored in UTC. A time without a timezone is rejected because it
  would mean different moments on servers in different timezones.
- **Listing includes expired coupons** with an `isExpired` flag, so their existence is preserved
  while the apply endpoint refuses them.
- **Money:** amounts may have at most 2 decimal places (cents or paise). Sub-cent input is rejected
  rather than silently rounded. The calculation uses integer cents to avoid floating-point errors.
  Amounts are capped at 1,000,000,000 as a sanity limit, which also keeps the integer arithmetic exact.
- **The database comes first.** `server.ts` connects to MongoDB and builds the index before calling
  `listen()`, so no request is accepted without a database. If the connection drops later, requests
  get an immediate `503` instead of waiting for a timeout.
- **Express 5** passes errors thrown in `async` handlers to the error handler automatically, so the
  routes don't need `try/catch` blocks just to forward errors.
- **CommonJS output.** `tsconfig.json` uses `"module": "nodenext"`, and `package.json` has no
  `"type": "module"`, so TypeScript compiles to CommonJS. Imports need no `.js` extensions, which
  avoids a common source of "module not found" errors, and the project behaves the same on Windows,
  macOS and Linux.
- **No extra libraries** for validation or testing (no Joi, Zod, Jest or Supertest): the checks are
  small and explicit, and Node's built-in test runner and `fetch` are enough for the tests.

## Known limitations

- No authentication: anyone who can reach the API can create coupons. This is out of scope for the
  assignment.
- `POST /coupons/apply` only calculates. It doesn't record that a coupon was used, so there are no
  usage limits or one-time coupons.
- `GET /coupons` returns every coupon with no pagination, which is fine for a small number of coupons.
- Coupons can't be updated or deleted through the API, because the assignment didn't ask for it.
- A single currency with 2 decimal places is assumed. Expiry is checked against the server's clock.
- The React page has no automated tests of its own in this repository.
- On Vercel, the first request after a quiet period also opens the database connection, so it can
  take a second or two longer than the requests after it.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `MONGODB_URI is not set` | Create `.env` from `.env.example` (step 2 of setup), in the project folder. |
| `Could not connect to MongoDB (... Could not connect to any servers in your MongoDB Atlas cluster ...)` | Add your current IP address under **Network Access** in Atlas. Your IP can change, for example on a different Wi-Fi network. |
| `bad auth : authentication failed` | The username or password in `MONGODB_URI` is wrong, or the password needs URL-encoding. |
| `querySrv EBADRESP _mongodb._tcp...` or `querySrv ECONNREFUSED _mongodb._tcp...` | Your network's DNS server (often the Wi-Fi router) can't answer the SRV lookup that `mongodb+srv://` addresses need. Use the standard connection string instead, which lists the servers directly: `mongodb://<user>:<password>@<host1>:27017,<host2>:27017,<host3>:27017/coupon_api?tls=true&replicaSet=<replica-set>&authSource=admin&retryWrites=true&w=majority`. Atlas shows it under **Connect → Drivers** if you pick an older Node.js driver version (2.2.12 or later). Alternatively, change your network's DNS to 8.8.8.8 or 1.1.1.1. |
| `Could not start the HTTP server on port 3000` | Another program is using the port. Stop it or set another `PORT` in `.env`. |
| `npm : File ...\npm.ps1 cannot be loaded because running scripts is disabled` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell once, or use `npm.cmd` instead of `npm`. |
| `Request body must be a JSON object` | Send the body as JSON with the header `Content-Type: application/json`. In Postman, choose **Body → raw → JSON**. |
