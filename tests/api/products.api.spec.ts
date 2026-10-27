import { test, expect } from '../../src/fixtures';
import { CARDS, CATEGORIES, PAGE_SIZE, PRODUCTS, SEED_PRODUCTS, VALID_ADDRESS, futureExpiry } from '../../src/data/testData';
import type { ApiProduct } from '../../src/utils/ApiClient';

/** Temporary products created by other tests (category "QA Fixtures") may exist while we run - ignore them. */
const seedOnly = (list: ApiProduct[]) => list.filter((p) => SEED_PRODUCTS.some((s) => s.slug === p.slug));
const sortNum = (a: number, b: number) => a - b;

test.describe('API · products', () => {
  test('list is paginated with metadata @smoke', async ({ api }) => {
    const res = await api.products();
    expect(res.page).toBe(1);
    expect(res.products).toHaveLength(PAGE_SIZE);
    expect(res.total).toBeGreaterThanOrEqual(SEED_PRODUCTS.length);
    expect(res.pages).toBe(Math.ceil(res.total / PAGE_SIZE));
    // list view omits the reviews array
    expect(res.products[0]).not.toHaveProperty('reviews');
  });

  test('limit is clamped to 1..50 and bad values fall back to defaults', async ({ api }) => {
    expect((await api.products({ limit: 1000 })).products.length).toBeLessThanOrEqual(50);
    expect((await api.products({ limit: 3 })).products).toHaveLength(3);
    expect((await api.products({ limit: 'abc' })).products).toHaveLength(PAGE_SIZE);
    expect((await api.products({ page: -5 })).page).toBe(1);
  });

  test('a page past the end is empty', async ({ api }) => {
    const res = await api.products({ page: 999 });
    expect(res.products).toEqual([]);
  });

  for (const category of CATEGORIES) {
    test(`category filter: ${category}`, async ({ api }) => {
      const res = await api.products({ category, limit: 50 });
      const expected = SEED_PRODUCTS.filter((p) => p.category === category).map((p) => p.name).sort();
      expect(res.products.map((p) => p.name).sort()).toEqual(expected);
      expect(res.total).toBe(expected.length);
    });
  }

  test('category=all returns everything', async ({ api }) => {
    const all = await api.products({ category: 'all', limit: 50 });
    expect(seedOnly(all.products)).toHaveLength(SEED_PRODUCTS.length);
  });

  test('search is case-insensitive over name, brand and description', async ({ api }) => {
    const byBrand = await api.products({ search: 'soundmax', limit: 50 });
    expect(byBrand.products.map((p) => p.brand)).toEqual(['SoundMax', 'SoundMax']);

    const byName = await api.products({ search: 'ATOMIC', limit: 50 });
    expect(byName.products.map((p) => p.name)).toEqual([PRODUCTS.atomicHabits.name]);

    const byDescription = await api.products({ search: 'noise cancellation', limit: 50 });
    expect(byDescription.products.map((p) => p.slug)).toEqual([PRODUCTS.headphones.slug]);
  });

  test('search treats regex characters literally', async ({ api }) => {
    const res = await api.products({ search: '(3-pack)', limit: 50 });
    expect(res.products.map((p) => p.slug)).toEqual([PRODUCTS.tshirt.slug]);
    const nothing = await api.products({ search: '.*', limit: 50 });
    expect(nothing.total).toBe(0);
  });

  test('price range is inclusive', async ({ api }) => {
    const res = await api.products({ minPrice: 45, maxPrice: 79, limit: 50 });
    const expected = SEED_PRODUCTS.filter((p) => p.price >= 45 && p.price <= 79).map((p) => p.slug).sort();
    expect(seedOnly(res.products).map((p) => p.slug).sort()).toEqual(expected);
    for (const p of res.products) {
      expect(p.price).toBeGreaterThanOrEqual(45);
      expect(p.price).toBeLessThanOrEqual(79);
    }
  });

  test('inStock=true hides sold-out products', async ({ api }) => {
    const res = await api.products({ inStock: true, category: 'Electronics', limit: 50 });
    expect(res.products.map((p) => p.slug)).not.toContain(PRODUCTS.keyboardOutOfStock.slug);
    expect(res.products.every((p) => p.stock > 0)).toBe(true);
    expect(res.total).toBe(SEED_PRODUCTS.filter((p) => p.category === 'Electronics' && p.stock > 0).length);
  });

  test('featured=true returns only featured products', async ({ api }) => {
    const res = await api.products({ featured: true, limit: 50 });
    expect(res.products.map((p) => p.slug).sort()).toEqual(SEED_PRODUCTS.filter((p) => p.featured).map((p) => p.slug).sort());
  });

  test.describe('sorting', () => {
    test('price-asc / price-desc', async ({ api }) => {
      const asc = (await api.products({ sort: 'price-asc', limit: 50 })).products.map((p) => p.price);
      const desc = (await api.products({ sort: 'price-desc', limit: 50 })).products.map((p) => p.price);
      expect(asc).toEqual([...asc].sort(sortNum));
      expect(desc).toEqual([...desc].sort(sortNum).reverse());
    });

    test('name A-Z', async ({ api }) => {
      const names = (await api.products({ sort: 'name', limit: 50 })).products.map((p) => p.name);
      // MongoDB default collation is binary (code-point) order
      expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    });

    test('rating high to low', async ({ api }) => {
      const ratings = (await api.products({ sort: 'rating', limit: 50 })).products.map((p) => p.rating);
      expect(ratings).toEqual([...ratings].sort(sortNum).reverse());
    });

    test('unknown sort falls back to newest without error', async ({ api }) => {
      const res = await api.get('/products?sort=bogus');
      expect(res.status()).toBe(200);
    });
  });

  test('categories endpoint lists every seeded category, sorted', async ({ api }) => {
    const res = await api.get('/products/categories');
    const { categories } = await res.json();
    for (const c of CATEGORIES) expect(categories).toContain(c);
    expect(categories).toEqual([...categories].sort());
  });

  test('get by slug and by id return the same product (with reviews)', async ({ api }) => {
    const bySlug = await api.product(PRODUCTS.headphones.slug);
    expect(bySlug).toMatchObject({ name: PRODUCTS.headphones.name, price: PRODUCTS.headphones.price, brand: 'SoundMax' });
    expect(Array.isArray(bySlug.reviews)).toBe(true);
    const byId = await api.product(bySlug._id);
    expect(byId.slug).toBe(bySlug.slug);
  });

  test('404 for unknown slug and unknown id', async ({ api }) => {
    expect((await api.get('/products/no-such-product')).status()).toBe(404);
    expect((await api.get('/products/0123456789abcdef01234567')).status()).toBe(404);
  });

  test('product images are generated SVGs', async ({ api }) => {
    const res = await api.get(`/images/${PRODUCTS.headphones.slug}.svg`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/svg+xml');
    expect(await res.text()).toContain('<svg');
  });
});

test.describe('API · reviews (verified buyers only)', () => {
  test('401 without a token', async ({ api, tempProduct }) => {
    const p = await tempProduct();
    expect((await api.post(`/products/${p._id}/reviews`, { rating: 5, comment: 'x' })).status()).toBe(401);
  });

  test('400 for missing fields or out-of-range rating', async ({ freshUser, tempProduct }) => {
    const p = await tempProduct();
    const missing = await freshUser.api.post(`/products/${p._id}/reviews`, { rating: 5 });
    expect(missing.status()).toBe(400);
    const tooHigh = await freshUser.api.post(`/products/${p._id}/reviews`, { rating: 6, comment: 'great' });
    expect(tooHigh.status()).toBe(400);
    expect((await tooHigh.json()).message).toBe('Rating must be between 1 and 5');
  });

  test('404 for unknown product', async ({ freshUser }) => {
    const res = await freshUser.api.post('/products/0123456789abcdef01234567/reviews', { rating: 4, comment: 'x' });
    expect(res.status()).toBe(404);
  });

  test('403 for someone who never bought it', async ({ freshUser, tempProduct }) => {
    const p = await tempProduct();
    const res = await freshUser.api.post(`/products/${p._id}/reviews`, { rating: 4, comment: 'Looks nice' });
    expect(res.status()).toBe(403);
    expect((await res.json()).message).toBe('Only customers who purchased this product can review it');
  });

  test('unpaid (COD/pending) orders do not count as a purchase', async ({ freshUser, tempProduct }) => {
    const p = await tempProduct();
    await freshUser.api.addToCart(p._id, 1);
    const order = await freshUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
    expect(order.status).toBe('pending');
    const res = await freshUser.api.post(`/products/${p._id}/reviews`, { rating: 4, comment: 'Not paid yet' });
    expect(res.status()).toBe(403);
  });

  test('a paying customer can review once; rating is recalculated', async ({ createUser, tempProduct }) => {
    const p = await tempProduct();
    const [alice, bob] = [await createUser(), await createUser()];
    for (const u of [alice, bob]) {
      await u.api.addToCart(p._id, 1);
      await u.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'card', card: { number: CARDS.success, expiry: futureExpiry(), cvc: '123' } });
    }

    const first = await alice.api.post(`/products/${p._id}/reviews`, { rating: 5, comment: 'Excellent' });
    expect(first.status()).toBe(201);
    const second = await bob.api.post(`/products/${p._id}/reviews`, { rating: 2, comment: 'Meh' });
    expect(second.status()).toBe(201);
    const { product } = await second.json();
    expect(product.numReviews).toBe(2);
    expect(product.rating).toBe(3.5);
    expect(product.reviews.map((r: { name: string }) => r.name)).toEqual([alice.name, bob.name]);

    const again = await alice.api.post(`/products/${p._id}/reviews`, { rating: 1, comment: 'Changed my mind' });
    expect(again.status()).toBe(409);
    expect((await again.json()).message).toBe('You have already reviewed this product');
  });
});
