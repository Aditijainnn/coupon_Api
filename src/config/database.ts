import mongoose from 'mongoose';

/**
 * How long the MongoDB driver keeps looking for a reachable server before it gives up.
 * The driver's default is 30 seconds. 10 seconds is still enough for a slow first connection
 * to MongoDB Atlas, but gives quicker, clearer feedback when the database can't be reached.
 */
const SERVER_SELECTION_TIMEOUT_MS = 10_000;

let isLoggingConnectionChanges = false;

/**
 * Logs connection changes that happen while the API is running (MongoDB going down and coming back).
 * Called only after the first successful connection, so a failed start prints one clear message
 * from server.ts instead of several. The connection string is never logged: it can contain a password.
 */
function logConnectionChanges(): void {
  if (isLoggingConnectionChanges) {
    return;
  }
  isLoggingConnectionChanges = true;
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
  mongoose.connection.on('error', (error: Error) => console.error(`MongoDB error: ${error.message}`));
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
  logConnectionChanges();
  console.log(`Connected to MongoDB (database: "${mongoose.connection.name}")`);
}

/** True when Mongoose has an open connection that queries can use. */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

/** Closes the connection. Used for graceful shutdown and by the tests. */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
