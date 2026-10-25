// Load the variables from .env into process.env. This import must stay first so the
// values are available before any other code runs.
import 'dotenv/config';

import app from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { Coupon } from './models/Coupon';

const DEFAULT_PORT = 3000;

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a whole number between 1 and 65535, but it is "${value}"`);
  }
  return port;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function start(): Promise<void> {
  const port = readPort(process.env.PORT);
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and set your MongoDB connection string.');
  }

  // 1. Connect to MongoDB first. The API can't do anything without it, so no requests are
  //    accepted until the connection is ready.
  try {
    await connectDatabase(mongoUri);
  } catch (error) {
    throw new Error(
      `Could not connect to MongoDB (${errorMessage(error)}). ` +
        'Check that MongoDB is running and that MONGODB_URI in your .env file is correct.',
      { cause: error },
    );
  }

  // 2. Make sure the unique index on `code` exists before the first coupon can be saved.
  await Coupon.init();

  // 3. Only now start accepting HTTP requests.
  //    In Express 5 the callback also receives an error if the port can't be used.
  const server = app.listen(port, (error?: Error) => {
    if (error) {
      console.error(`Could not start the HTTP server on port ${port}: ${error.message}`);
      console.error('Is another program already using this port? Stop it, or set a different PORT in .env.');
      void disconnectDatabase().finally(() => process.exit(1));
      return;
    }
    console.log(`Coupon API is running at http://localhost:${port}`);
  });

  // Ctrl+C (SIGINT) or a stop signal from the hosting platform (SIGTERM): finish open requests,
  // close the database connection, then exit.
  const shutdown = (signal: string): void => {
    console.log(`${signal} received, shutting down...`);
    // Safety net: force an exit if something keeps the server from closing within 10 seconds.
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(async (error: unknown) => {
  console.error(`Failed to start the Coupon API: ${errorMessage(error)}`);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
