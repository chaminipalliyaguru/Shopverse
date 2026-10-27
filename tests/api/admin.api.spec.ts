import { test, expect } from '../../src/fixtures';
import { CARDS, USERS, VALID_ADDRESS, futureExpiry } from '../../src/data/testData';
import { uid } from '../../src/utils/random';

const ADMIN_GETS = ['/admin/stats', '/admin/orders', '/admin/users'];

test.describe('API · admin', () => {
  test.describe('access control', () => {
    for (const path of ADMIN_GETS) {
      test(`GET ${path}: 401 anonymous, 403 customer, 200 admin`, async ({ api, adminApi, freshUser }) => {
        expect((await api.get(path)).status()).toBe(401);
        const asCustomer = await freshUser.api.get(path);
        expect(asCustomer.status()).toBe(403);
        expect((await asCustomer.json()).message).toBe('Admin access required');
        expect((await adminApi.get(path)).status()).toBe(200);
      });
    }

    test('customers cannot create, update or delete products', async ({ freshUser, tempProduct }) => {
      const p = await tempProduct();
      expect((await freshUser.api.post('/admin/products', { name: 'x', description: 'x', price: 1, category: 'x' })).status()).toBe(403);
      expect((await freshUser.api.put(`/admin/products/${p._id}`, { price: 0 })).status()).toBe(403);
      expect((await freshUser.api.delete(`/admin/products/${p._id}`)).status()).toBe(403);
    });

    test('the seeded customer account is not an admin', async ({ api }) => {
      const { token } = await api.login(USERS.customer.email, USERS.customer.password);
      expect((await api.as(token).get('/admin/stats')).status()).toBe(403);
    });
  });

  test('stats have the right shape and count paid revenue', async ({ adminApi, freshUser, tempProduct }) => {
    const p = await tempProduct({ price: 10 });
    await freshUser.api.addToCart(p._id, 1);
    const paid = await freshUser.api.placeOrder({
      shippingAddress: VALID_ADDRESS,
      paymentMethod: 'card',
      card: { number: CARDS.success, expiry: futureExpiry(), cvc: '123' },
    });

    const stats = await (await adminApi.get('/admin/stats')).json();
    expect(stats).toEqual({ users: expect.any(Number), products: expect.any(Number), orders: expect.any(Number), revenue: expect.any(Number) });
    expect(stats.users).toBeGreaterThanOrEqual(4); // 3 seeded + freshUser
    expect(stats.products).toBeGreaterThanOrEqual(25);
    expect(stats.orders).toBeGreaterThanOrEqual(1);
    expect(stats.revenue).toBeGreaterThanOrEqual(paid.totalPrice);
  });

  test('users list never exposes password hashes', async ({ adminApi }) => {
    const { users } = await (await adminApi.get('/admin/users')).json();
    expect(users.length).toBeGreaterThanOrEqual(3);
    for (const u of users) expect(u).not.toHaveProperty('password');
    expect(users.map((u: { email: string }) => u.email)).toEqual(expect.arrayContaining(Object.values(USERS).map((u) => u.email)));
  });

  test.describe('product CRUD', () => {
    test('create -> read -> update -> delete', async ({ adminApi, api }) => {
      const name = `CRUD Lamp ${uid()}`;
      const created = await adminApi.adminCreateProduct({ name, description: 'Desk lamp', price: 25.5, category: 'Home', brand: 'Lumo', stock: 7, featured: true });
      expect(created).toMatchObject({ name, price: 25.5, stock: 7, category: 'Home', featured: true });
      expect(created.slug).toBe(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));

      try {
        expect((await api.product(created.slug)).name).toBe(name);

        const updated = await adminApi.adminUpdateProduct(created._id, { price: 19.99, stock: 0 });
        expect(updated).toMatchObject({ price: 19.99, stock: 0, name });
      } finally {
        const del = await adminApi.delete(`/admin/products/${created._id}`);
        expect(del.status()).toBe(200);
      }
      expect((await api.get(`/products/${created.slug}`)).status()).toBe(404);
      expect((await adminApi.delete(`/admin/products/${created._id}`)).status()).toBe(404);
    });

    test('duplicate names get a unique slug', async ({ adminApi }) => {
      const name = `Twin ${uid()}`;
      const a = await adminApi.adminCreateProduct({ name, description: 'a', price: 1, category: 'QA Fixtures' });
      const b = await adminApi.adminCreateProduct({ name, description: 'b', price: 1, category: 'QA Fixtures' });
      try {
        expect(b.slug).not.toBe(a.slug);
        expect(b.slug.startsWith(a.slug)).toBe(true);
      } finally {
        await adminApi.adminDeleteProduct(a._id);
        await adminApi.adminDeleteProduct(b._id);
      }
    });

    const invalid = [
      { title: 'missing name', body: { description: 'x', price: 1, category: 'x' }, message: 'Name, description, price and category are required' },
      { title: 'missing price', body: { name: 'x', description: 'x', category: 'x' }, message: 'Name, description, price and category are required' },
      { title: 'negative price', body: { name: 'x', description: 'x', price: -1, category: 'x' }, message: 'Price cannot be negative' },
      { title: 'negative stock', body: { name: 'x', description: 'x', price: 1, category: 'x', stock: -3 }, message: 'Stock cannot be negative' },
    ];
    for (const c of invalid) {
      test(`create: 400 for ${c.title}`, async ({ adminApi }) => {
        const res = await adminApi.post('/admin/products', c.body);
        expect(res.status()).toBe(400);
        expect((await res.json()).message).toBe(c.message);
      });
    }

    test('update: 400 for negative price, 404 for unknown id', async ({ adminApi, tempProduct }) => {
      const p = await tempProduct();
      const neg = await adminApi.put(`/admin/products/${p._id}`, { price: -5 });
      expect(neg.status()).toBe(400);
      expect((await adminApi.put('/admin/products/0123456789abcdef01234567', { price: 5 })).status()).toBe(404);
    });
  });

  test.describe('order management', () => {
    test('orders list includes customer details', async ({ adminApi, freshUser, tempProduct }) => {
      const p = await tempProduct();
      await freshUser.api.addToCart(p._id, 1);
      const order = await freshUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });

      const { orders } = await (await adminApi.get('/admin/orders')).json();
      const row = orders.find((o: { _id: string }) => o._id === order._id);
      expect(row.user).toMatchObject({ email: freshUser.email, name: freshUser.name });
    });

    test('status flow pending -> paid -> shipped -> delivered', async ({ adminApi, freshUser, tempProduct, db }) => {
      const p = await tempProduct();
      await freshUser.api.addToCart(p._id, 1);
      const order = await freshUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
      expect(order.isPaid).toBe(false);

      const paid = await adminApi.adminSetOrderStatus(order._id, 'paid');
      expect(paid).toMatchObject({ status: 'paid', isPaid: true });
      expect((await db.findOrderByNumber(order.orderNumber))!.paidAt).toBeInstanceOf(Date);

      for (const status of ['shipped', 'delivered'] as const) {
        expect((await adminApi.adminSetOrderStatus(order._id, status)).status).toBe(status);
      }
    });

    test('400 for invalid status, 404 for unknown order', async ({ adminApi, freshUser, tempProduct }) => {
      const p = await tempProduct();
      await freshUser.api.addToCart(p._id, 1);
      const order = await freshUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });

      const bad = await adminApi.put(`/admin/orders/${order._id}/status`, { status: 'lost' });
      expect(bad.status()).toBe(400);
      expect((await bad.json()).message).toBe('Invalid status');
      expect((await adminApi.put('/admin/orders/0123456789abcdef01234567/status', { status: 'paid' })).status()).toBe(404);
    });
  });
});
