import { test, expect, signIn } from '../../src/fixtures';
import { PRODUCTS, USERS } from '../../src/data/testData';
import { uniqueEmail } from '../../src/utils/random';

test.describe('Login', () => {
  test('customer logs in and lands on the home page @smoke', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.customer.email, USERS.customer.password);
    await expect(page).toHaveURL('/');
    await loginPage.navbar.expectLoggedInAs(USERS.customer.name);
    await expect(loginPage.navbar.adminLink).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeTruthy();
  });

  test('admin logs in and is taken to the admin panel', async ({ page, loginPage, adminPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.admin.email, USERS.admin.password);
    await expect(page).toHaveURL('/admin');
    await expect(adminPage.stats.root).toBeVisible();
    await expect(loginPage.navbar.adminLink).toBeVisible();
  });

  test('email is case-insensitive', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.jane.email.toUpperCase(), USERS.jane.password);
    await loginPage.navbar.expectLoggedInAs(USERS.jane.name);
  });

  const bad = [
    { title: 'wrong password', email: USERS.customer.email, password: 'Wrong@123', error: 'Invalid email or password' },
    { title: 'unknown email', email: 'nobody@shopverse.test', password: 'Whatever1', error: 'Invalid email or password' },
    { title: 'empty form', email: '', password: '', error: 'Email and password are required' },
  ];
  for (const c of bad) {
    test(`shows an error for ${c.title}`, async ({ page, loginPage }) => {
      await loginPage.goto();
      await loginPage.login(c.email, c.password);
      await expect(loginPage.error).toHaveText(c.error);
      await expect(page).toHaveURL('/login');
      await loginPage.navbar.expectLoggedOut();
    });
  }

  test('submit button shows a busy state while signing in', async ({ page, loginPage }) => {
    // slow the login request down so the transient state is observable
    await page.route('**/api/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await loginPage.goto();
    await loginPage.login(USERS.customer.email, USERS.customer.password);
    await expect(loginPage.submit).toHaveText('Signing in...');
    await expect(loginPage.submit).toBeDisabled();
    await expect(page).toHaveURL('/');
  });

  test('a stale/invalid token is discarded on load', async ({ page, homePage }) => {
    await signIn(page, 'this.is.not-valid');
    await homePage.goto();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull();
    await homePage.navbar.expectLoggedOut();
  });

  test('logout clears the session', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.jane.email, USERS.jane.password);
    await loginPage.navbar.expectLoggedInAs(USERS.jane.name);

    await loginPage.navbar.logoutButton.click();
    await expect(page).toHaveURL('/');
    await loginPage.navbar.expectLoggedOut();
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();

    // protected pages are no longer reachable
    await page.goto('/orders');
    await expect(page).toHaveURL('/login');
  });

  test('session survives a page reload', async ({ page, signedInUser, homePage }) => {
    await homePage.goto();
    await homePage.navbar.expectLoggedInAs(signedInUser.name);
    await page.reload();
    await homePage.navbar.expectLoggedInAs(signedInUser.name);
  });
});

test.describe('Registration', () => {
  test('new customer can register and is signed in @smoke', async ({ page, api, db, registerPage }) => {
    const email = uniqueEmail('ui-reg');
    try {
      await registerPage.goto();
      await registerPage.register({ name: 'Nimal Perera', email, password: 'Secret@123', confirm: 'Secret@123' });
      await expect(page).toHaveURL('/');
      await registerPage.navbar.expectLoggedInAs('Nimal Perera');

      const dbUser = await db.findUserByEmail(email);
      expect(dbUser).toMatchObject({ name: 'Nimal Perera', role: 'user' });
      expect(dbUser!.password).toMatch(/^\$2[aby]\$/);
    } finally {
      await api.deleteUser(email);
    }
  });

  test('shows a message for every empty field', async ({ registerPage }) => {
    await registerPage.goto();
    await registerPage.submit.click();
    await expect(registerPage.fieldError('name')).toHaveText('Name is required');
    await expect(registerPage.fieldError('email')).toHaveText('Email is required');
    await expect(registerPage.fieldError('password')).toHaveText('Password is required');
    await expect(registerPage.fieldError('confirm')).toBeHidden(); // '' === ''
  });

  const cases = [
    { title: 'invalid email', form: { name: 'A', email: 'a@b', password: 'Secret@123', confirm: 'Secret@123' }, field: 'email', message: 'Please enter a valid email address' },
    { title: 'short password', form: { name: 'A', email: 'a@b.co', password: '12345', confirm: '12345' }, field: 'password', message: 'Password must be at least 6 characters' },
    { title: 'mismatched passwords', form: { name: 'A', email: 'a@b.co', password: 'Secret@123', confirm: 'Secret@124' }, field: 'confirm', message: 'Passwords do not match' },
    { title: 'whitespace-only name', form: { name: '   ', email: 'a@b.co', password: 'Secret@123', confirm: 'Secret@123' }, field: 'name', message: 'Name is required' },
  ] as const;

  for (const c of cases) {
    test(`client-side validation: ${c.title}`, async ({ page, registerPage }) => {
      let called = false;
      await page.route('**/api/auth/register', (route) => ((called = true), route.continue()));
      await registerPage.goto();
      await registerPage.register(c.form);
      await expect(registerPage.fieldError(c.field)).toHaveText(c.message);
      await expect(page).toHaveURL('/register');
      expect(called, 'no request should be sent when the form is invalid').toBe(false);
    });
  }

  test('duplicate email shows the server error', async ({ page, registerPage }) => {
    await registerPage.goto();
    await registerPage.register({ name: 'Dup', email: USERS.customer.email, password: 'Secret@123', confirm: 'Secret@123' });
    await expect(registerPage.serverError).toHaveText('An account with this email already exists');
    await expect(page).toHaveURL('/register');
  });

  test('login page links to registration and keeps the return path', async ({ page, api, loginPage, registerPage, productPage }) => {
    const email = uniqueEmail('ret');
    try {
      // guest tries to add to cart -> login -> "create an account" -> back to the product
      await productPage.goto(PRODUCTS.cleanCode.slug);
      await productPage.addToCartButton.click();
      await expect(page).toHaveURL('/login');
      await loginPage.registerLink.click();
      await registerPage.register({ name: 'Return User', email, password: 'Secret@123', confirm: 'Secret@123' });
      await expect(page).toHaveURL(`/products/${PRODUCTS.cleanCode.slug}`);
    } finally {
      await api.deleteUser(email);
    }
  });
});

test.describe('Route guards', () => {
  for (const path of ['/cart', '/checkout', '/orders', '/profile']) {
    test(`guest visiting ${path} is sent to login and back afterwards`, async ({ page, loginPage }) => {
      await page.goto(path);
      await expect(page).toHaveURL('/login');
      await loginPage.login(USERS.jane.email, USERS.jane.password);
      await expect(page).toHaveURL(path);
    });
  }

  test('guest visiting /admin is sent to login', async ({ page }) => {
    await page.goto('/admin/products');
    await expect(page).toHaveURL('/login');
  });

  test('customer visiting /admin gets 403', async ({ page, signedInUser, adminPage }) => {
    void signedInUser;
    await page.goto('/admin');
    await expect(adminPage.forbidden).toContainText('403 - Forbidden');
    await expect(adminPage.root).toBeHidden();
  });
});
