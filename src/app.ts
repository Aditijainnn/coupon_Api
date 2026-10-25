import express, { type NextFunction, type Request, type Response } from 'express';
import { isDatabaseConnected } from './config/database';
import { DATABASE_UNAVAILABLE_MESSAGE, errorHandler, notFoundHandler } from './middleware/errorHandler';
import couponRoutes from './routes/coupons';
import { HttpError } from './utils/httpError';

/*
 * The Express application: middleware and routes only. Starting the server and connecting
 * to MongoDB happen in server.ts, so the tests can use this app without opening a real port.
 */
const app = express();

// Don't advertise which framework the server runs on (removes the X-Powered-By header).
app.disable('x-powered-by');

// Parse JSON request bodies into req.body. Coupon requests are tiny, so anything over 10 kB is rejected.
app.use(express.json({ limit: '10kb' }));

/** GET /health: quick check that the API is running and connected to MongoDB. */
app.get('/health', (_req, res) => {
  const connected = isDatabaseConnected();
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'unavailable',
    database: connected ? 'connected' : 'disconnected',
  });
});

/**
 * If MongoDB goes down after the server has started, answer 503 straight away
 * instead of making the client wait for the database timeout.
 */
function requireDatabase(_req: Request, _res: Response, next: NextFunction): void {
  if (!isDatabaseConnected()) {
    next(new HttpError(503, DATABASE_UNAVAILABLE_MESSAGE));
    return;
  }
  next();
}

app.use('/coupons', requireDatabase, couponRoutes);

// These two must come after all routes: unknown routes get a JSON 404,
// and every error ends up in the central error handler.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
