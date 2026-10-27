# ShopVerse — Playwright test suite

End-to-end **UI** tests and **API** tests for ShopVerse, written in TypeScript with
[Playwright Test](https://playwright.dev). It also checks MongoDB directly for things the UI can't show
(password hashing, stock levels, saved orders).

**238 tests** (4 setup, 124 API, 110 UI) over auth, catalogue, product detail, cart, coupons,
shipping/tax maths, checkout and payments, orders and cancellation, reviews, profile, admin, and access control.

## Requirements

- Node **20+**
- ShopVerse running: web on `http://localhost:5173`, API on `:5000`
  (the tests reach the API through Vite's `/api` proxy, so only the web URL is needed)
- MongoDB at `mongodb://127.0.0.1:27017/shopverse`
- `ENABLE_TEST_ROUTES=true` in `server/.env` (needed for `/api/test/reset` and cleanup)

## Setup (Windows CMD)

```cmd
cd D:\Projects\shopverse\e2e
npm install
npx playwright install
copy .env.example .env
```

## Run

Start the app in another terminal (`cd D:\Projects\shopverse` then `npm run dev`), then:

| Command | What it runs |
|---|---|
| `npm test` | API + Chromium UI tests (default) |
| `npm run test:api` | API tests only (fast, no browser) |
| `npm run test:ui` | UI tests in Chromium |
| `npm run test:smoke` | Only tests tagged `@smoke` |
| `npm run test:headed` | UI tests with a visible browser, one worker |
| `npm run test:ui-mode` | Playwright UI mode (watch, time-travel debugging) |
| `npm run test:debug` | Step through with the Playwright Inspector |
| `npm run test:cross-browser` | UI tests in Chromium, Firefox and WebKit |
| `npm run report` | Open the last HTML report |
| `npm run typecheck` | `tsc --noEmit` |

To run one file or one test: `npx playwright test tests/ui/cart.spec.ts` or `npx playwright test -g "SAVE10"`.

> **Warning: every run resets the database.** The `setup` project calls `POST /api/test/reset`, which wipes the DB and
> re-seeds it, so the tests always start from known data. Set `RESET_DB=false` in `.env` to skip this. Don't point
> the suite at a database whose data you need to keep.

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:5173` | React app |
| `API_URL` | `${BASE_URL}/api` | Use `http://localhost:5000/api` to skip the Vite proxy |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/shopverse` | Used for DB assertions |
| `RESET_DB` | `true` | Reset and re-seed the database before each run |
| `START_APP` | `false` | `true` makes Playwright run `npm run dev` in the parent folder if the app isn't up |

## Project layout

```
e2e/
├─ playwright.config.ts      projects: setup → api, chromium (firefox/webkit on demand)
├─ src/
│  ├─ config/env.ts          env vars + storage-state paths
│  ├─ data/testData.ts       mirror of server seed data: users, products, coupons, cards, address
│  ├─ fixtures/index.ts      custom fixtures (see below)
│  ├─ pages/                 Page Object Model (Navbar, Home, Login, Register, Products, ProductDetail,
│  │                         Cart, Checkout, Orders/OrderDetail, Profile, Admin)
│  └─ utils/
│     ├─ ApiClient.ts        typed REST client over Playwright's APIRequestContext
│     ├─ db.ts               read-only MongoDB helper
│     ├─ pricing.ts          separate copy of the pricing rules, used to check the app's numbers
│     └─ random.ts           unique ids / emails
└─ tests/
   ├─ setup/global.setup.ts  health check, DB reset, admin/customer storage states
   ├─ api/                   auth, products & reviews, cart & coupons, orders & payments, admin
   └─ ui/                    navigation, auth & guards, catalogue, product detail, cart, checkout,
                             orders, reviews, profile, admin
```

## Fixtures

```ts
import { test, expect } from '../../src/fixtures';

test('example', async ({ signedInUser, cartPage, tempProduct, db }) => {
  const p = await tempProduct({ price: 20, stock: 3 });   // throw-away product, deleted afterwards
  await signedInUser.api.addToCart(p._id, 2);             // set up state through the API (fast)
  await cartPage.goto();                                  // check behaviour through the UI
  await expect(cartPage.quantityOf(p.name)).toHaveText('2');
  expect(await db.productStock(p.slug)).toBe(3);          // check the database directly
});
```

| Fixture | Description |
|---|---|
| `api` / `adminApi` | `ApiClient`, anonymous or logged in as the seeded admin |
| `freshUser` | New customer registered via the API, deleted after the test |
| `signedInUser` | `freshUser`, already logged in on `page` (token in localStorage, no login UI) |
| `createUser()` | Factory for more users in the same test (owner and stranger, concurrent buyers…) |
| `tempProduct()` | Product created through the admin API in category `QA Fixtures`, deleted after the test |
| `db` | `ShopDb` for read-only MongoDB checks |
| `homePage`, `cartPage`, `adminPage`, … | Page objects |

Admin UI tests use the saved admin session: `test.use({ storageState: STORAGE_STATE.admin })`.

## How tests stay independent when run in parallel

- Every test that changes a cart or places orders uses its own `freshUser`, so carts never collide.
- Anything that changes stock, ratings or reviews uses a `tempProduct`. Seeded products are only read or added to carts,
  so catalogue tests can rely on exact seed counts (for example, Electronics = 6).
- Catalogue tests that need exact counts filter by a seeded category, so temporary products from other tests
  never show up in them.
- Expected prices and totals come from `pricing.ts` and `testData.ts`, not from copied numbers.

If `server/src/seedData.js` changes, update `src/data/testData.ts` to match.

## Notes on what's covered

- **Payments:** every mock-gateway outcome (success, declined, insufficient funds, invalid, expired, bad
  expiry or CVC). Failures don't create an order or change stock.
- **Stock:** decremented on purchase, restored on cancel. An item that sells out between cart and checkout returns
  409. A concurrent-checkout test checks the last unit can't be sold twice.
- **Coupons:** the maths for each coupon, case and whitespace handling, expired, disabled and unknown codes,
  minimum order, re-checking when the cart shrinks, and dropping below free shipping after a discount.
- **Security:** 401/403 on every protected area, tampered or stale JWTs, no password hashes in responses, no
  user enumeration on login, other users' orders hidden, prices always taken from the DB.

## CI

`CI=true` turns on `forbidOnly`, 2 retries and 2 workers. Reports go to `playwright-report/` (HTML) and
`test-results/junit.xml`. Traces, screenshots and videos are kept for failed tests: open them with
`npx playwright show-trace <trace.zip>`.
