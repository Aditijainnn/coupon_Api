import express, { type NextFunction, type Request, type Response } from 'express';
import { ensureDatabaseConnection } from './config/database';
import { DATABASE_UNAVAILABLE_MESSAGE, errorHandler, notFoundHandler } from './middleware/errorHandler';
import couponRoutes from './routes/coupons';
import { HttpError } from './utils/httpError';

/*
 * The Express application: middleware and routes only.
 * - Locally, server.ts connects to MongoDB and then starts the server with this app.
 *   The tests also use this app directly, without opening a real port.
 * - On Vercel this file is the entry point (see vercel.json): Vercel imports the app, server.ts
 *   never runs, and the first request opens the database connection (ensureDatabaseConnection).
 */
const app = express();

// Don't advertise which framework the server runs on (removes the X-Powered-By header).
app.disable('x-powered-by');

// Parse JSON request bodies into req.body. Coupon requests are tiny, so anything over 10 kB is rejected.
app.use(express.json({ limit: '10kb' }));

/** GET /health: quick check that the API is running and connected to MongoDB. */
app.get('/health', async (_req, res) => {
  const connected = await ensureDatabaseConnection();
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'unavailable',
    database: connected ? 'connected' : 'disconnected',
  });
});

/**
 * The coupon routes need MongoDB. If it can't be reached, answer 503 with a clear message
 * instead of letting the request fail later inside a route.
 */
async function requireDatabase(_req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (await ensureDatabaseConnection()) {
    next();
    return;
  }
  next(new HttpError(503, DATABASE_UNAVAILABLE_MESSAGE));
}

app.use('/coupons', requireDatabase, couponRoutes);

// These two must come after all routes: unknown routes get a JSON 404,
// and every error ends up in the central error handler.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
