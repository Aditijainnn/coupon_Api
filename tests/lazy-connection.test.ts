/*
 * On Vercel, src/app.ts is loaded on its own: server.ts never runs, so nothing connects to MongoDB
 * at startup. This checks that the first request opens the connection instead.
 * It only calls GET /health, so no coupons are read or changed. Skipped without MONGODB_URI.
 */
import 'dotenv/config';

import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import app from '../src/app';
import { disconnectDatabase, isDatabaseConnected } from '../src/config/database';

test(
  'the first request connects to MongoDB when server.ts has not run, as on Vercel',
  { skip: process.env.MONGODB_URI ? false : 'MONGODB_URI is not set, so this test was skipped' },
  async () => {
    assert.equal(isDatabaseConnected(), false, 'nothing should be connected before the first request');

    const server = app.listen(0); // port 0 = any free port
    await once(server, 'listening');
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/health`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
      assert.equal(isDatabaseConnected(), true);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await disconnectDatabase();
    }
  },
);
