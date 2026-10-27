import { test, expect } from '../../src/fixtures';
import { ADDRESS_LABELS, Address, CARDS, CARD_MESSAGES, COUPONS, VALID_ADDRESS, futureExpiry } from '../../src/data/testData';
import { expectedTotals } from '../../src/utils/pricing';

const card = (number: string, expiry = futureExpiry(), cvc = '123') => ({ number, expiry, cvc });

test.describe('API · orders', () => {
  test('401 without a token', async ({ api }) => {
    expect((await api.post('/orders', {})).status()).toBe(401);
    expect((await api.get('/orders/mine')).status()).toBe(401);
  });

  test.describe('validation', () => {
    test('400 when the cart is empty', async ({ freshUser }) => {
      const res = await freshUser.api.post('/orders', { shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
      expect(res.status()).toBe(400);
      expect((await res.json()).message).toBe('Your cart is empty');
    });

    test('400 without a shipping address', async ({ freshUser }) => {
      const res = await freshUser.api.post('/orders', { paymentMethod: 'cod' });
      expect(res.status()).toBe(400);
      expect((await res.json()).message).toBe('Shipping address is required');
    });

    for (const field of Object.keys(ADDRESS_LABELS) as (keyof Address)[]) {
      test(`400 when address.${field} is blank`, async ({ freshUser }) => {
        const res = await freshUser.api.post('/orders', { shippingAddress: { ...VALID_ADDRESS, [field]: '   ' }, paymentMethod: 'cod' });
        expect(res.status()).toBe(400);
        expect((await res.json()).message).toBe(`Shipping address: ${field} is required`);
      });
    }

    test('400 for an unknown payment method', async ({ freshUser }) => {
      const res = await freshUser.api.post('/orders', { shippingAddress: VALID_ADDRESS, paymentMethod: 'bitcoin' });
      expect(res.status()).toBe(400);
      expect((await res.json()).message).toBe('Invalid payment method');
    });
  });

  test.describe('mock payment gateway', () => {
    const failures = [
      { title: 'declined card', card: card(CARDS.declined), message: CARD_MESSAGES.declined },
      { title: 'insufficient funds', card: card(CARDS.insufficientFunds), message: CARD_MESSAGES.insufficientFunds },
      { title: 'unknown 16-digit number', card: card(CARDS.unknown), message: CARD_MESSAGES.invalid },
      { title: 'too-short number', card: card('4242 4242'), message: CARD_MESSAGES.invalid },
      { title: 'expired card', card: card(CARDS.success, '01/20'), message: CARD_MESSAGES.expired },
      { title: 'badly formatted expiry', card: card(CARDS.success, '1/2030'), message: 'Invalid expiry date (use MM/YY)' },
      { title: 'month 13', card: card(CARDS.success, '13/40'), message: 'Invalid expiry date (use MM/YY)' },
      { title: 'invalid CVC', card: card(CARDS.success, futureExpiry(), '12'), message: 'Invalid CVC' },
    ];

    for (const f of failures) {
      test(`402 for ${f.title}; nothing is charged or reserved`, async ({ freshUser, tempProduct, db }) => {
        const p = await tempProduct({ stock: 5 });
        await freshUser.api.addToCart(p._id, 2);

        const res = await freshUser.api.post('/orders', { shippingAddress: VALID_ADDRESS, paymentMethod: 'card', card: f.card });
        expect(res.status()).toBe(402);
        expect((await res.json()).message).toBe(f.message);

        expect(await db.productStock(p.slug)).toBe(5);
        expect((await freshUser.api.cart()).itemCount).toBe(2);
        expect(await freshUser.api.myOrders()).toEqual([]);
      });
    }
  });

  test('card order: paid, totals match, stock decremented, cart emptied @smoke', async ({ freshUser, tempProduct, db }) => {
    const p = await tempProduct({ price: 35.5, stock: 10 });
    await freshUser.api.addToCart(p._id, 3);
    const res = await freshUser.api.post('/orders', { shippingAddress: VALID_ADDRESS, paymentMethod: 'card', card: card(CARDS.success) });
    expect(res.status()).toBe(201);
    const { order } = await res.json();

    expect(order).toMatchObject({
      status: 'paid',
      isPaid: true,
      paymentMethod: 'card',
      shippingAddress: VALID_ADDRESS,
      coupon: null,
      ...expectedTotals([{ price: 35.5, quantity: 3 }]),
    });
    expect(order.orderNumber).toMatch(/^ORD-[A-Z0-9]+$/);
    expect(order.items).toEqual([expect.objectContaining({ product: p._id, name: p.name, price: 35.5, quantity: 3 })]);
    // the card number is never stored
    expect(JSON.stringify(order)).not.toContain('4242424242424242');

    expect(await db.productStock(p.slug)).toBe(7);
    expect((await freshUser.api.cart()).items).toEqual([]);

    const saved = await db.findOrderByNumber(order.orderNumber);
    expect(saved).toMatchObject({ status: 'paid', totalPrice: order.totalPrice, isPaid: true });
    expect(saved!.paidAt).toBeInstanceOf(Date);
  });

  test('cash-on-delivery order is pending and unpaid', async ({ freshUser, tempProduct }) => {
    const p = await tempProduct();
    await freshUser.api.addToCart(p._id, 1);
    const order = await freshUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
    expect(order).toMatchObject({ status: 'pending', isPaid: false, paymentMethod: 'cod' });
  });

  test('coupon and discount are stored on the order', async ({ freshUser, tempProduct }) => {
    const p = await tempProduct({ price: 60 });
    await freshUser.api.addToCart(p._id, 2);
    await freshUser.api.applyCoupon(COUPONS.welcome20.code);
    const order = await freshUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
    expect(order).toMatchObject({ coupon: 'WELCOME20', ...expectedTotals([{ price: 60, quantity: 2 }], COUPONS.welcome20) });
  });

  test('409 when stock ran out after the item was added to the cart', async ({ freshUser, adminApi, tempProduct, db }) => {
    const p = await tempProduct({ stock: 2 });
    await freshUser.api.addToCart(p._id, 2);
    await adminApi.adminUpdateProduct(p._id, { stock: 1 }); // someone else bought one

    const res = await freshUser.api.post('/orders', { shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
    expect(res.status()).toBe(409);
    expect((await res.json()).message).toBe(`Not enough stock for "${p.name}"`);
    expect(await db.productStock(p.slug)).toBe(1);
  });

  test('concurrent checkouts cannot oversell the last unit', async ({ createUser, tempProduct, db }) => {
    const p = await tempProduct({ stock: 1 });
    const buyers = [await createUser(), await createUser(), await createUser()];
    for (const b of buyers) await b.api.addToCart(p._id, 1);

    const results = await Promise.all(
      buyers.map((b) => b.api.post('/orders', { shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' }))
    );
    const statuses = results.map((r) => r.status()).sort();
    expect(statuses).toEqual([201, 409, 409]);
    expect(await db.productStock(p.slug)).toBe(0);
  });

  test.describe('reading orders', () => {
    test('/orders/mine returns only my orders, newest first', async ({ createUser, tempProduct }) => {
      const p = await tempProduct();
      const [me, other] = [await createUser(), await createUser()];
      await me.api.addToCart(p._id, 1);
      const first = await me.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
      await me.api.addToCart(p._id, 1);
      const second = await me.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
      await other.api.addToCart(p._id, 1);
      await other.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });

      const mine = await me.api.myOrders();
      expect(mine.map((o) => o._id)).toEqual([second._id, first._id]);
    });

    test("403 for someone else's order; admin can read it", async ({ createUser, adminApi, tempProduct }) => {
      const p = await tempProduct();
      const [owner, stranger] = [await createUser(), await createUser()];
      await owner.api.addToCart(p._id, 1);
      const order = await owner.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });

      const res = await stranger.api.get(`/orders/${order._id}`);
      expect(res.status()).toBe(403);
      expect((await res.json()).message).toBe('You can only view your own orders');

      const asAdmin = await adminApi.get(`/orders/${order._id}`);
      expect(asAdmin.status()).toBe(200);
      expect((await asAdmin.json()).order.user.email).toBe(owner.email);
    });

    test('404 for unknown id, 400 for malformed id', async ({ freshUser }) => {
      expect((await freshUser.api.get('/orders/0123456789abcdef01234567')).status()).toBe(404);
      expect((await freshUser.api.get('/orders/nope')).status()).toBe(400);
    });
  });

  test.describe('cancellation', () => {
    test('cancelling restores stock; cancelling twice is rejected', async ({ freshUser, tempProduct, db }) => {
      const p = await tempProduct({ stock: 10 });
      await freshUser.api.addToCart(p._id, 4);
      const order = await freshUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'card', card: card(CARDS.success) });
      expect(await db.productStock(p.slug)).toBe(6);

      const res = await freshUser.api.put(`/orders/${order._id}/cancel`);
      expect(res.status()).toBe(200);
      expect((await res.json()).order.status).toBe('cancelled');
      expect(await db.productStock(p.slug)).toBe(10);

      const again = await freshUser.api.put(`/orders/${order._id}/cancel`);
      expect(again.status()).toBe(400);
      expect((await again.json()).message).toBe('Orders that are cancelled cannot be cancelled');
      expect(await db.productStock(p.slug)).toBe(10);
    });

    test("cannot cancel someone else's order", async ({ createUser, tempProduct }) => {
      const p = await tempProduct();
      const [owner, stranger] = [await createUser(), await createUser()];
      await owner.api.addToCart(p._id, 1);
      const order = await owner.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
      const res = await stranger.api.put(`/orders/${order._id}/cancel`);
      expect(res.status()).toBe(403);
    });

    for (const status of ['shipped', 'delivered'] as const) {
      test(`cannot cancel a ${status} order`, async ({ freshUser, adminApi, tempProduct }) => {
        const p = await tempProduct();
        await freshUser.api.addToCart(p._id, 1);
        const order = await freshUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
        await adminApi.adminSetOrderStatus(order._id, status);
        const res = await freshUser.api.put(`/orders/${order._id}/cancel`);
        expect(res.status()).toBe(400);
        expect((await res.json()).message).toBe(`Orders that are ${status} cannot be cancelled`);
      });
    }
  });
});
