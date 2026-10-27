import { test, expect } from '../../src/fixtures';
import { PAGE_SIZE, PRODUCTS, SEED_PRODUCTS } from '../../src/data/testData';

const seed = (pred: (p: (typeof SEED_PRODUCTS)[number]) => boolean) => SEED_PRODUCTS.filter(pred);

test.describe('Catalogue: filters, sorting, pagination', () => {
  test('first page shows 8 products with pagination @smoke', async ({ productsPage }) => {
    await productsPage.goto();
    await expect(productsPage.heading).toHaveText('All products');
    await expect(productsPage.cards).toHaveCount(PAGE_SIZE);
    await expect(productsPage.pagination).toBeVisible();
    await expect(productsPage.prevPage).toBeDisabled();
    await expect(productsPage.pageButton(1)).toHaveAttribute('aria-current', 'page');
  });

  test('next / previous / numbered pages update the URL and the results', async ({ page, productsPage }) => {
    await productsPage.goto();
    const page1 = await productsPage.names();

    await productsPage.next();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(productsPage.pageButton(2)).toHaveAttribute('aria-current', 'page');
    const page2 = await productsPage.names();
    expect(page2).toHaveLength(PAGE_SIZE);
    // (not asserting full disjointness: other parallel tests may add temporary products)
    expect(page2).not.toEqual(page1);

    await productsPage.previous();
    await expect(page).toHaveURL(/[?&]page=1/);
    await expect(productsPage.prevPage).toBeDisabled();
    await expect(productsPage.cards).toHaveCount(PAGE_SIZE);

    await productsPage.goToPage(3);
    await expect(page).toHaveURL(/[?&]page=3/);
    await expect(productsPage.cards.first()).toBeVisible();
  });

  test('category filter', async ({ page, productsPage }) => {
    await productsPage.goto();
    await productsPage.filterByCategory('Electronics');
    await expect(page).toHaveURL(/category=Electronics/);
    const expected = seed((p) => p.category === 'Electronics');
    await productsPage.expectCount(expected.length);
    expect(new Set(await productsPage.categories())).toEqual(new Set(['Electronics']));
    // fewer than one page -> no pagination
    await expect(productsPage.pagination).toBeHidden();
  });

  test('price range filter (combined with category)', async ({ page, productsPage }) => {
    await productsPage.goto({ category: 'Books' });
    await productsPage.setPriceRange(20, 40);
    await expect(page).toHaveURL(/minPrice=20/);
    await expect(page).toHaveURL(/maxPrice=40/);
    const expected = seed((p) => p.category === 'Books' && p.price >= 20 && p.price <= 40).map((p) => p.name).sort();
    await productsPage.expectCount(expected.length);
    expect((await productsPage.names()).sort()).toEqual(expected);
  });

  test('"In stock only" hides sold-out products', async ({ productsPage }) => {
    await productsPage.goto({ category: 'Electronics' });
    await expect(productsPage.card(PRODUCTS.keyboardOutOfStock.name)).toBeVisible();
    await productsPage.toggleInStockOnly();
    await expect(productsPage.inStockOnly).toBeChecked();
    await productsPage.expectCount(seed((p) => p.category === 'Electronics' && p.stock > 0).length);
    await expect(productsPage.card(PRODUCTS.keyboardOutOfStock.name)).toHaveCount(0);
  });

  test('sort by price, both directions', async ({ productsPage }) => {
    await productsPage.goto({ category: 'Electronics' });
    const expectedAsc = seed((p) => p.category === 'Electronics').map((p) => p.price).sort((a, b) => a - b);

    await productsPage.sortBy('price-asc');
    expect(await productsPage.prices()).toEqual(expectedAsc);

    await productsPage.sortBy('price-desc');
    expect(await productsPage.prices()).toEqual([...expectedAsc].reverse());
  });

  test('sort by name and by rating', async ({ productsPage }) => {
    await productsPage.goto({ category: 'Home' });
    await productsPage.sortBy('name');
    const names = await productsPage.names();
    expect(names).toEqual([...names].sort());

    await productsPage.goto({ category: 'Books' });
    await productsPage.sortBy('rating');
    await expect(productsPage.cards.first().getByTestId('product-name')).toHaveText(PRODUCTS.atomicHabits.name);
  });

  test('changing a filter resets to page 1', async ({ page, productsPage }) => {
    await productsPage.goto({ page: 2 });
    await productsPage.sortBy('price-asc');
    await expect(page).not.toHaveURL(/page=/);
    await expect(productsPage.pageButton(1)).toHaveAttribute('aria-current', 'page');
  });

  test('filters live in the URL: deep links and reload restore them', async ({ page, productsPage }) => {
    await productsPage.goto({ category: 'Sports', sort: 'price-desc', inStock: true });
    await expect(productsPage.categoryFilter).toHaveValue('Sports');
    await expect(productsPage.sortSelect).toHaveValue('price-desc');
    await expect(productsPage.inStockOnly).toBeChecked();
    const before = await productsPage.names();

    await page.reload();
    await productsPage.waitForResults();
    expect(await productsPage.names()).toEqual(before);
    await expect(productsPage.categoryFilter).toHaveValue('Sports');
  });

  test('"Clear filters" resets everything', async ({ page, productsPage }) => {
    await productsPage.goto({ category: 'Books', minPrice: 10, maxPrice: 20, sort: 'name' });
    await productsPage.reloadAfter(() => productsPage.clearFilters.click());
    await expect(page).toHaveURL(/\/products$/);
    await expect(productsPage.categoryFilter).toHaveValue('all');
    await expect(productsPage.minPrice).toHaveValue('');
    await expect(productsPage.maxPrice).toHaveValue('');
    await expect(productsPage.sortSelect).toHaveValue('newest');
  });

  test('no results state', async ({ productsPage }) => {
    await productsPage.goto({ search: 'zz-no-such-thing-zz' });
    await expect(productsPage.noResults).toContainText('No products found');
    await productsPage.expectCount(0);
    await expect(productsPage.pagination).toBeHidden();
  });

  test('sold-out product card is disabled', async ({ productsPage }) => {
    await productsPage.goto({ search: 'Mechanical' });
    const card = productsPage.card(PRODUCTS.keyboardOutOfStock.name);
    await expect(card.getByTestId('out-of-stock')).toHaveText('Out of stock');
    await expect(card.getByTestId('add-to-cart')).toBeDisabled();
    await expect(card.getByTestId('add-to-cart')).toHaveText('Unavailable');
  });

  test('guest clicking "Add to cart" is sent to login', async ({ page, productsPage }) => {
    await productsPage.goto({ search: 'Atomic' });
    await productsPage.addToCart(PRODUCTS.atomicHabits.name);
    await expect(page).toHaveURL('/login');
  });

  test('signed-in user adds from the card and the badge updates', async ({ signedInUser, productsPage }) => {
    await productsPage.goto({ search: 'Atomic' });
    await productsPage.addToCart(PRODUCTS.atomicHabits.name);
    await expect(productsPage.toast('success', `${PRODUCTS.atomicHabits.name} added to cart`)).toBeVisible();
    await expect(productsPage.navbar.cartCount).toHaveText('1');
    expect((await signedInUser.api.cart()).itemCount).toBe(1);
  });
});
