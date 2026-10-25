import mongoose from 'mongoose';

/**
 * How long the MongoDB driver keeps looking for a reachable server before it gives up.
 * The driver's default is 30 seconds. 10 seconds is still enough for a slow first connection
 * to MongoDB Atlas, but gives quicker, clearer feedback when the database can't be reached.
 */
const SERVER_SELECTION_TIMEOUT_MS = 10_000;

/** Becomes true after the first successful connection in this process. */
let hasConnected = false;

/** The connection attempt started by ensureDatabaseConnection, shared by requests that arrive together. */
let firstConnection: Promise<void> | null = null;

/**
 * Logs connection changes that happen while the API is running (MongoDB going down and coming back).
 * The connection string is never logged: it can contain a password.
 */
function logConnectionChanges(): void {
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
  mongoose.connection.on('error', (error: Error) => console.error(`MongoDB error: ${error.message}`));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Connects Mongoose to MongoDB.
 * Resolves when the connection is ready and rejects if MongoDB cannot be reached,
 * so the caller (server.ts) can refuse to start.
 *
 * @param uri    MongoDB connection string, e.g. mongodb://127.0.0.1:27017/coupon_api
 * @param dbName optional database name that overrides the one in the URI (the tests use this
 *               so they never touch your real data)
 */
export async function connectDatabase(uri: string, dbName?: string): Promise<void> {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    ...(dbName ? { dbName } : {}),
  });
  if (!hasConnected) {
    // Registered only after the first successful connection, so a failed start prints
    // one clear message from server.ts instead of several.
    hasConnected = true;
    logConnectionChanges();
  }
  console.log(`Connected to MongoDB (database: "${mongoose.connection.name}")`);
}

/** True when Mongoose has an open connection that queries can use. */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

/**
 * Makes sure MongoDB is connected before a request uses it, and says whether it is.
 *
 * Locally, server.ts connects before the server starts, so this only checks the connection.
 * Vercel loads app.ts without running server.ts, so there the first request connects (using
 * MONGODB_URI) and later requests reuse that connection. Requests that arrive together share one
 * attempt, and a failed attempt is forgotten so that the next request tries again.
 *
 * After a connection has been made, the MongoDB driver reconnects by itself when the network
 * comes back, so this never starts a second connection.
 */
export async function ensureDatabaseConnection(): Promise<boolean> {
  if (isDatabaseConnected()) {
    return true;
  }
  const uri = process.env.MONGODB_URI;
  if (hasConnected || !uri) {
    return false;
  }

  firstConnection ??= connectDatabase(uri).catch((error: unknown) => {
    console.error(`Could not connect to MongoDB: ${errorMessage(error)}`);
    firstConnection = null;
    throw error;
  });
  try {
    await firstConnection;
    return true;
  } catch {
    return false;
  }
}

/** Closes the connection. Used for graceful shutdown and by the tests. */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
