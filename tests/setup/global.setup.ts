import fs from 'fs';
import path from 'path';
import { test as setup, expect } from '@playwright/test';
import { env, STORAGE_STATE } from '../../src/config/env';
import { USERS } from '../../src/data/testData';
import { ApiClient } from '../../src/utils/ApiClient';

/**
 * Runs once before the `api` and `chromium` projects:
 *  1. checks the app + API are reachable (through the Vite proxy by default)
 *  2. resets & re-seeds MongoDB via POST /api/test/reset (unless RESET_DB=false)
 *  3. writes logged-in storage states for the seeded admin and customer
 *
 * Serial on purpose: the reset recreates users (new ids), so tokens must be issued after it.
 */
setup.describe.configure({ mode: 'serial' });

setup('app and API are reachable', async ({ request }) => {
  const api = new ApiClient(request);
  let res;
  try {
    res = await api.health();
  } catch (err) {
    throw new Error(
      `ShopVerse is not reachable at ${env.apiURL}. Start it with "npm run dev" in the shopverse folder ` +
        `(API :5000 + web :5173), or set START_APP=true in e2e/.env.\n${(err as Error).message}`
    );
  }
  expect(res.ok(), `GET ${env.apiURL}/health`).toBeTruthy();
  expect((await res.json()).status).toBe('ok');

  const web = await request.get(env.baseURL);
  expect(web.ok(), `GET ${env.baseURL}`).toBeTruthy();
});

setup('reset database to seed data', async ({ request }) => {
  setup.skip(!env.resetDb, 'RESET_DB=false');
  const res = await new ApiClient(request).post('/test/reset');
  expect(
    res.status(),
    'POST /api/test/reset failed - make sure ENABLE_TEST_ROUTES=true in server/.env and restart the API'
  ).toBe(200);
  expect(await res.json()).toMatchObject({ users: 3, products: 24, coupons: 5 });
});

for (const role of ['admin', 'customer'] as const) {
  setup(`save ${role} storage state`, async ({ request }) => {
    const { token } = await new ApiClient(request).login(USERS[role].email, USERS[role].password);
    const file = STORAGE_STATE[role];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ cookies: [], origins: [{ origin: env.origin, localStorage: [{ name: 'token', value: token }] }] }, null, 2)
    );
  });
}
