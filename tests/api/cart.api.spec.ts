import { test, expect } from '../../src/fixtures';
import { COUPONS, INVALID_COUPONS, MAX_QTY_PER_ITEM, PRODUCTS } from '../../src/data/testData';
import { expectedTotals } from '../../src/utils/pricing';

test.describe('API · cart', () => {
  test('401 for every cart endpoint without a token', async ({ api }) => {
    const calls = [
      api.get('/cart'),
      api.post('/cart/items', { productId: 'x' }),
      api.put('/cart/items/x', { quantity: 1 }),
      api.delete('/cart/items/x'),
      api.delete('/cart'),
      api.post('/cart/coupon', { code: 'SAVE10' }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status()).toBe(401);
  });

  test('a new user starts with an empty, zero-total cart', async ({ freshUser }) => {
    const cart = await freshUser.api.cart();
    expect(cart).toMatchObject({ items: [], itemCount: 0, itemsPrice: 0, discount: 0, shippingPrice: 0, taxPrice: 0, totalPrice: 0, coupon: null });
  });

  test('adding the same product twice merges the line @smoke', async ({ freshUser, api }) => {
    const p = await api.product(PRODUCTS.speaker.slug);
    await freshUser.api.addToCart(p._id, 1);
    const cart = await freshUser.api.addToCart(p._id, 2);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({ product: p._id, quantity: 3, price: 45, lineTotal: 135 });
    expect(cart.itemCount).toBe(3);
    expect(cart).toMatchObject(expectedTotals([{ price: 45, quantity: 3 }]));
  });

  test('prices always come from the database, not the client', async ({ freshUser, api }) => {
    const p = await api.product(PRODUCTS.headphones.slug);
    const res = await freshUser.api.post('/cart/items', { productId: p._id, quantity: 1, price: 0.01 });
    expect(res.status()).toBe(201);
    expect((await res.json()).cart.items[0].price).toBe(PRODUCTS.headphones.price);
  });

  test.describe('validation', () => {
    test('400 without productId / with negative quantity', async ({ freshUser, api }) => {
      expect((await freshUser.api.post('/cart/items', {})).status()).toBe(400);
      const p = await api.product(PRODUCTS.speaker.slug);
      const neg = await freshUser.api.post('/cart/items', { productId: p._id, quantity: -1 });
      expect(neg.status()).toBe(400);
      expect((await neg.json()).message).toBe('Quantity must be at least 1');
    });

    test('404 for unknown product, 400 for malformed id', async ({ freshUser }) => {
      expect((await freshUser.api.post('/cart/items', { productId: '0123456789abcdef01234567' })).status()).toBe(404);
      const bad = await freshUser.api.post('/cart/items', { productId: 'not-an-id' });
      expect(bad.status()).toBe(400);
      expect((await bad.json()).message).toBe('Invalid id');
    });

    test('400 for an out-of-stock product', async ({ freshUser, api }) => {
      const p = await api.product(PRODUCTS.keyboardOutOfStock.slug);
      const res = await freshUser.api.post('/cart/items', { productId: p._id, quantity: 1 });
      expect(res.status()).toBe(400);
      expect((await res.json()).message).toBe('Product is out of stock');
    });

    test(`max ${MAX_QTY_PER_ITEM} units per product (including merges)`, async ({ freshUser, api }) => {
      const p = await api.product(PRODUCTS.tshirt.slug);
      const tooMany = await freshUser.api.post('/cart/items', { productId: p._id, quantity: MAX_QTY_PER_ITEM + 1 });
      expect(tooMany.status()).toBe(400);
      expect((await tooMany.json()).message).toBe(`You can only order up to ${MAX_QTY_PER_ITEM} of one item`);

      await freshUser.api.addToCart(p._id, 6);
      const merged = await freshUser.api.post('/cart/items', { productId: p._id, quantity: 5 });
      expect(merged.status()).toBe(400);
      expect((await freshUser.api.cart()).items[0].quantity).toBe(6);

      const update = await freshUser.api.put(`/cart/items/${p._id}`, { quantity: MAX_QTY_PER_ITEM + 1 });
      expect(update.status()).toBe(400);
    });

    test('cannot exceed available stock', async ({ freshUser, tempProduct }) => {
      const p = await tempProduct({ stock: 3 });
      const res = await freshUser.api.post('/cart/items', { productId: p._id, quantity: 4 });
      expect(res.status()).toBe(400);
      expect((await res.json()).message).toBe('Only 3 left in stock');

      await freshUser.api.addToCart(p._id, 3);
      const update = await freshUser.api.put(`/cart/items/${p._id}`, { quantity: 4 });
      expect(update.status()).toBe(400);
    });
  });

  test.describe('update & remove', () => {
    test('PUT sets the quantity; 0 is rejected; unknown line is 404', async ({ freshUser, api }) => {
      const p = await api.product(PRODUCTS.yogaMat.slug);
      await freshUser.api.addToCart(p._id, 1);

      const ok = await freshUser.api.put(`/cart/items/${p._id}`, { quantity: 4 });
      expect(ok.status()).toBe(200);
      expect((await ok.json()).cart.items[0].quantity).toBe(4);

      expect((await freshUser.api.put(`/cart/items/${p._id}`, { quantity: 0 })).status()).toBe(400);

      const other = await api.product(PRODUCTS.cleanCode.slug);
      const notInCart = await freshUser.api.put(`/cart/items/${other._id}`, { quantity: 1 });
      expect(notInCart.status()).toBe(404);
      expect((await notInCart.json()).message).toBe('Item not in cart');
    });

    test('DELETE removes a line; DELETE /cart empties everything incl. coupon', async ({ freshUser, api }) => {
      const a = await api.product(PRODUCTS.yogaMat.slug);
      const b = await api.product(PRODUCTS.cleanCode.slug);
      await freshUser.api.addToCart(a._id, 2);
      await freshUser.api.addToCart(b._id, 1);
      await freshUser.api.applyCoupon(COUPONS.save10.code);

      const afterRemove = await (await freshUser.api.delete(`/cart/items/${a._id}`)).json();
      expect(afterRemove.cart.items.map((i: { product: string }) => i.product)).toEqual([b._id]);

      const cleared = await freshUser.api.clearCart();
      expect(cleared.items).toEqual([]);
      expect(cleared.coupon).toBeNull();
    });

    test('lines for deleted products disappear from the cart', async ({ freshUser, adminApi, tempProduct }) => {
      const p = await tempProduct();
      await freshUser.api.addToCart(p._id, 1);
      await adminApi.adminDeleteProduct(p._id);
      expect((await freshUser.api.cart()).items).toEqual([]);
    });
  });

  test.describe('coupons', () => {
    // 2 x Atomic Habits (16.99) + 1 x Smart Watch (199) = 232.98
    const lines = [
      { slug: PRODUCTS.atomicHabits.slug, price: PRODUCTS.atomicHabits.price, quantity: 2 },
      { slug: PRODUCTS.smartWatch.slug, price: PRODUCTS.smartWatch.price, quantity: 1 },
    ];

    for (const coupon of Object.values(COUPONS)) {
      test(`${coupon.code} is applied with correct maths`, async ({ freshUser }) => {
        for (const l of lines) await freshUser.api.addSlugToCart(l.slug, l.quantity);
        const cart = await freshUser.api.applyCoupon(coupon.code);
        expect(cart.coupon).toMatchObject({ code: coupon.code, type: coupon.type, value: coupon.value });
        expect(cart).toMatchObject(expectedTotals(lines, coupon));
      });
    }

    test('codes are case-insensitive and trimmed', async ({ freshUser }) => {
      await freshUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
      const cart = await freshUser.api.applyCoupon('  save10 ');
      expect(cart.coupon?.code).toBe('SAVE10');
    });

    for (const [name, c] of Object.entries(INVALID_COUPONS)) {
      test(`rejects ${name} coupon ${c.code}`, async ({ freshUser }) => {
        await freshUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
        const res = await freshUser.api.post('/cart/coupon', { code: c.code });
        expect(res.status()).toBe(400);
        expect((await res.json()).message).toBe(c.message);
        expect((await freshUser.api.cart()).coupon).toBeNull();
      });
    }

    test('400 when no code is sent', async ({ freshUser }) => {
      expect((await freshUser.api.post('/cart/coupon', {})).status()).toBe(400);
    });

    test('minimum order is enforced (WELCOME20 needs $50, FLAT15 needs $30)', async ({ freshUser }) => {
      await freshUser.api.addSlugToCart(PRODUCTS.atomicHabits.slug, 1); // 16.99
      for (const [code, min] of [
        ['WELCOME20', '50.00'],
        ['FLAT15', '30.00'],
      ]) {
        const res = await freshUser.api.post('/cart/coupon', { code });
        expect(res.status()).toBe(400);
        expect((await res.json()).message).toBe(`Coupon requires a minimum order of $${min}`);
      }
    });

    test('an applied coupon is re-validated when the cart shrinks below its minimum', async ({ freshUser, api }) => {
      const p = await api.product(PRODUCTS.atomicHabits.slug);
      await freshUser.api.addToCart(p._id, 3); // 50.97 >= 50
      let cart = await freshUser.api.applyCoupon(COUPONS.welcome20.code);
      expect(cart.discount).toBeGreaterThan(0);

      cart = (await (await freshUser.api.put(`/cart/items/${p._id}`, { quantity: 2 })).json()).cart; // 33.98 < 50
      expect(cart.coupon).toBeNull();
      expect(cart.couponError).toBe('Coupon requires a minimum order of $50.00');
      expect(cart.discount).toBe(0);
      expect(cart).toMatchObject(expectedTotals([{ price: p.price, quantity: 2 }]));
    });

    test('FLAT15 takes a fixed $15 off at exactly its $30 minimum', async ({ freshUser, tempProduct }) => {
      const p = await tempProduct({ price: 30 });
      await freshUser.api.addToCart(p._id, 1);
      const cart = await freshUser.api.applyCoupon(COUPONS.flat15.code);
      expect(cart.discount).toBe(15);
      expect(cart).toMatchObject(expectedTotals([{ price: 30, quantity: 1 }], COUPONS.flat15));
    });

    test('DELETE /cart/coupon removes it', async ({ freshUser }) => {
      await freshUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
      await freshUser.api.applyCoupon(COUPONS.save10.code);
      const res = await freshUser.api.delete('/cart/coupon');
      expect((await res.json()).cart).toMatchObject({ coupon: null, discount: 0 });
    });
  });

  test.describe('shipping & tax', () => {
    const cases = [
      { title: 'below $100 pays flat $5.99', price: 99.99, shipping: 5.99 },
      { title: 'exactly $100 ships free', price: 100, shipping: 0 },
      { title: 'above $100 ships free', price: 100.01, shipping: 0 },
    ];
    for (const c of cases) {
      test(`subtotal ${c.title}`, async ({ freshUser, tempProduct }) => {
        const p = await tempProduct({ price: c.price });
        const cart = await freshUser.api.addToCart(p._id, 1);
        expect(cart.shippingPrice).toBe(c.shipping);
        expect(cart).toMatchObject(expectedTotals([{ price: c.price, quantity: 1 }]));
      });
    }

    test('free shipping is based on the DISCOUNTED subtotal', async ({ freshUser, api }) => {
      // 5 x $22 = $110 -> SAVE10 -> $99 => shipping is charged again
      const p = await api.product(PRODUCTS.waterBottle.slug);
      expect((await freshUser.api.addToCart(p._id, 5)).shippingPrice).toBe(0);
      const cart = await freshUser.api.applyCoupon(COUPONS.save10.code);
      expect(cart).toMatchObject({ itemsPrice: 110, discount: 11, shippingPrice: 5.99, taxPrice: 7.92, totalPrice: 112.91 });
    });
  });
});
