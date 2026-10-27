import { Page, test as base, expect } from '@playwright/test';
import { env } from '../config/env';
import { Credentials, USERS } from '../data/testData';
import { ApiClient, ApiProduct } from '../utils/ApiClient';
import { ShopDb } from '../utils/db';
import { uid, uniqueEmail } from '../utils/random';
import { AdminPage } from '../pages/AdminPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { OrderDetailPage, OrdersPage } from '../pages/OrdersPage';
import { ProductDetailPage } from '../pages/ProductDetailPage';
import { ProductsPage } from '../pages/ProductsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RegisterPage } from '../pages/RegisterPage';

export interface TestUser extends Credentials {
  id: string;
  token: string;
  /** ApiClient already authenticated as this user. */
  api: ApiClient;
}

export interface TempProductInput {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  brand?: string;
  stock?: number;
}

/**
 * Put a JWT into localStorage the same way the app does after login,
 * so the next navigation starts authenticated (skips the login UI).
 */
export async function signIn(page: Page, token: string) {
  await page.goto('/');
  await page.evaluate((t) => localStorage.setItem('token', t), token);
}

type TestFixtures = {
  /** Unauthenticated API client. */
  api: ApiClient;
  /** API client authenticated as the seeded admin. */
  adminApi: ApiClient;
  /** Factory: registers a brand-new customer (deleted again after the test). */
  createUser: (overrides?: Partial<Credentials>) => Promise<TestUser>;
  /** A brand-new customer, registered via the API. Isolated cart/orders per test. */
  freshUser: TestUser;
  /** `freshUser`, already signed in on `page`. */
  signedInUser: TestUser;
  /** Factory: creates a throw-away product via the admin API (deleted after the test). */
  tempProduct: (input?: TempProductInput) => Promise<ApiProduct>;

  homePage: HomePage;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  productsPage: ProductsPage;
  productPage: ProductDetailPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  ordersPage: OrdersPage;
  orderPage: OrderDetailPage;
  profilePage: ProfilePage;
  adminPage: AdminPage;
};

type WorkerFixtures = {
  /** Direct MongoDB access (connected lazily, once per worker). */
  db: ShopDb;
  /** JWT of the seeded admin (logged in once per worker). */
  adminToken: string;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // ---------- worker scoped ----------
  db: [
    async ({}, use) => {
      const db = await ShopDb.connect();
      await use(db);
      await db.close();
    },
    { scope: 'worker' },
  ],

  adminToken: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext();
      const { token } = await new ApiClient(ctx).login(USERS.admin.email, USERS.admin.password);
      await ctx.dispose();
      await use(token);
    },
    { scope: 'worker' },
  ],

  // ---------- API ----------
  api: async ({ request }, use) => {
    await use(new ApiClient(request));
  },

  adminApi: async ({ request, adminToken }, use) => {
    await use(new ApiClient(request, adminToken));
  },

  createUser: async ({ api }, use) => {
    const created: string[] = [];
    await use(async (overrides = {}) => {
      const creds: Credentials = {
        name: overrides.name ?? `PW User ${uid()}`,
        email: overrides.email ?? uniqueEmail(),
        password: overrides.password ?? 'Secret@123',
      };
      const { token, user } = await api.register(creds.name, creds.email, creds.password);
      created.push(creds.email);
      return { ...creds, id: user._id, token, api: api.as(token) };
    });
    for (const email of created) await api.deleteUser(email);
  },

  freshUser: async ({ createUser }, use) => {
    await use(await createUser());
  },

  signedInUser: async ({ page, freshUser }, use) => {
    await signIn(page, freshUser.token);
    await use(freshUser);
  },

  tempProduct: async ({ adminApi }, use) => {
    const created: string[] = [];
    await use(async (input = {}) => {
      const id = uid();
      const product = await adminApi.adminCreateProduct({
        name: input.name ?? `QA Item ${id}`,
        description: input.description ?? `Temporary product ${id} created by the e2e suite`,
        price: input.price ?? 50,
        category: input.category ?? 'QA Fixtures',
        brand: input.brand ?? 'QA Brand',
        stock: input.stock ?? 20,
      });
      created.push(product._id);
      return product;
    });
    for (const id of created) await adminApi.adminDeleteProduct(id);
  },

  // ---------- page objects ----------
  homePage: async ({ page }, use) => use(new HomePage(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  registerPage: async ({ page }, use) => use(new RegisterPage(page)),
  productsPage: async ({ page }, use) => use(new ProductsPage(page)),
  productPage: async ({ page }, use) => use(new ProductDetailPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),
  ordersPage: async ({ page }, use) => use(new OrdersPage(page)),
  orderPage: async ({ page }, use) => use(new OrderDetailPage(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),
  adminPage: async ({ page }, use) => use(new AdminPage(page)),
});

export { expect, env };
