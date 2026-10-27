import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const trimSlash = (s: string) => s.replace(/\/+$/, '');

const baseURL = trimSlash(process.env.BASE_URL || 'http://localhost:5173');

export const env = {
  /** React app (Vite). */
  baseURL,
  /** Origin used for localStorage in saved storage states. */
  origin: new URL(baseURL).origin,
  /** REST API root. Defaults to the Vite proxy so only the web URL is needed. */
  apiURL: trimSlash(process.env.API_URL || `${baseURL}/api`),
  /** MongoDB used by ShopVerse - for DB-level assertions. */
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shopverse',
  /** Reset + re-seed the DB at the start of every run (POST /api/test/reset). */
  resetDb: (process.env.RESET_DB || 'true').toLowerCase() !== 'false',
  /** Let Playwright start the app with `npm run dev` in the parent folder. */
  startApp: (process.env.START_APP || 'false').toLowerCase() === 'true',
};

const AUTH_DIR = path.resolve(__dirname, '..', '..', '.auth');

/** Storage-state files written by tests/setup/global.setup.ts */
export const STORAGE_STATE = {
  admin: path.join(AUTH_DIR, 'admin.json'),
  customer: path.join(AUTH_DIR, 'customer.json'),
};
