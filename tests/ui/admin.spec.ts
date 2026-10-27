import { test, expect, env } from '../../src/fixtures';
import { STORAGE_STATE } from '../../src/config/env';
import { USERS, VALID_ADDRESS } from '../../src/data/testData';
import { money } from '../../src/utils/pricing';
import { uid } from '../../src/utils/random';

// Every test in this file starts logged in as the seeded admin (saved by the setup project).
test.use({ storageState: STORAGE_STATE.admin });

test.describe('Admin panel', () => {
  test('dashboard shows store statistics @smoke', async ({ adminPage, adminApi }) => {
    await adminPage.gotoDashboard();
    await expect(adminPage.navbar.adminLink).toBeVisible();
    await expect(adminPage.navbar.profileLink).toHaveText(USERS.admin.name);

    const stats = await (await adminApi.get('/admin/stats')).json();
    // values can move while other tests run in parallel, so check format + sane bounds
    for (const loc of [adminPage.stats.users, adminPage.stats.products, adminPage.stats.orders]) {
      await expect(loc).toHaveText(/^\d+$/);
    }
    expect(Number(await adminPage.stats.users.innerText())).toBeGreaterThanOrEqual(3);
    expect(Number(await adminPage.stats.products.innerText())).toBeGreaterThanOrEqual(24);
    await expect(adminPage.stats.revenue).toHaveText(/^\$\d+\.\d{2}$/);
    expect(stats.revenue).toBeGreaterThanOrEqual(0);
  });

  test('tabs switch between sections', async ({ page, adminPage }) => {
    await adminPage.gotoDashboard();
    await adminPage.tabs.products.click();
    await expect(page).toHaveURL('/admin/products');
    await expect(adminPage.productForm.root).toBeVisible();
    await adminPage.tabs.orders.click();
    await expect(page).toHaveURL('/admin/orders');
    await expect(page.getByTestId('admin-orders-table')).toBeVisible();
    await adminPage.tabs.dashboard.click();
    await expect(adminPage.stats.root).toBeVisible();
  });

  test.describe('products', () => {
    test('create a product and find it in the store', async ({ adminPage, adminApi, productsPage }) => {
      const name = `Admin Gadget ${uid()}`;
      try {
        await adminPage.gotoProducts();
        await adminPage.fillProductForm({ name, category: 'QA Fixtures', brand: 'QA Brand', price: 77.77, stock: 9, description: 'Created from the admin UI' });
        await adminPage.productForm.submit.click();

        await expect(adminPage.toast('success', 'Product created')).toBeVisible();
        const row = adminPage.productRow(name);
        await expect(row.getByTestId('ap-price')).toHaveText(money(77.77));
        await expect(row.getByTestId('ap-stock')).toHaveText('9');
        await expect(adminPage.productForm.name).toHaveValue(''); // form reset

        await productsPage.goto({ search: name });
        await productsPage.expectCount(1);
        await expect(productsPage.card(name).getByTestId('product-price')).toHaveText(money(77.77));
      } finally {
        const { products } = await adminApi.products({ search: name });
        for (const p of products) await adminApi.adminDeleteProduct(p._id);
      }
    });

    test('edit a product', async ({ adminPage, tempProduct, api }) => {
      const p = await tempProduct({ price: 10, stock: 5 });
      await adminPage.gotoProducts();
      await adminPage.editProduct(p.name);
      await expect(adminPage.productForm.name).toHaveValue(p.name);
      await expect(adminPage.productForm.price).toHaveValue('10');

      await adminPage.fillProductForm({ price: 12.5, stock: 7 });
      await adminPage.productForm.submit.click();
      await expect(adminPage.toast('success', 'Product updated')).toBeVisible();
      await expect(adminPage.productRow(p.name).getByTestId('ap-price')).toHaveText(money(12.5));
      await expect(adminPage.productRow(p.name).getByTestId('ap-stock')).toHaveText('7');
      expect(await api.product(p.slug)).toMatchObject({ price: 12.5, stock: 7 });
    });

    test('cancel editing resets the form', async ({ adminPage, tempProduct }) => {
      const p = await tempProduct();
      await adminPage.gotoProducts();
      await adminPage.editProduct(p.name);
      await adminPage.productForm.cancel.click();
      await expect(adminPage.productForm.submit).toHaveText('Create');
      await expect(adminPage.productForm.name).toHaveValue('');
    });

    test('delete asks for confirmation', async ({ adminPage, tempProduct, api }) => {
      const p = await tempProduct();
      await adminPage.gotoProducts();

      await adminPage.deleteProduct(p.name, false); // dismiss the confirm dialog
      await expect(adminPage.productRow(p.name)).toHaveCount(1);

      await adminPage.deleteProduct(p.name, true);
      await expect(adminPage.toast('success', 'Product deleted')).toBeVisible();
      await expect(adminPage.productRow(p.name)).toHaveCount(0);
      expect((await api.get(`/products/${p.slug}`)).status()).toBe(404);
    });

    test('required fields block submission (HTML5 validation)', async ({ page, adminPage }) => {
      let posted = false;
      await page.route('**/api/admin/products', (route) => ((posted = true), route.continue()));
      await adminPage.gotoProducts();
      await adminPage.productForm.submit.click();
      expect(await adminPage.productForm.name.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
      expect(posted).toBe(false);
    });
  });

  test.describe('orders', () => {
    test("changing an order's status is visible to the customer", async ({ browser, adminPage, freshUser, tempProduct }) => {
      const p = await tempProduct();
      await freshUser.api.addToCart(p._id, 1);
      const order = await freshUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });

      await adminPage.gotoOrders();
      const row = adminPage.orderRow(order.orderNumber);
      await expect(row).toContainText(freshUser.email);
      await expect(row.getByTestId('order-status')).toHaveText('pending');

      await adminPage.setOrderStatus(order.orderNumber, 'shipped');
      await expect(adminPage.toast('success', 'Order marked shipped')).toBeVisible();
      await expect(row.getByTestId('order-status')).toHaveText('shipped');

      // customer's view in a separate, independent browser context
      const customerContext = await browser.newContext({
        baseURL: env.baseURL,
        storageState: { cookies: [], origins: [{ origin: env.origin, localStorage: [{ name: 'token', value: freshUser.token }] }] },
      });
      try {
        const customerPage = await customerContext.newPage();
        await customerPage.goto(`/orders/${order._id}`);
        await expect(customerPage.getByTestId('order-detail').getByTestId('order-status')).toHaveText('shipped');
        await expect(customerPage.getByTestId('cancel-order')).toHaveCount(0);
      } finally {
        await customerContext.close();
      }
    });
  });
});
