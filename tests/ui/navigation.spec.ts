import { test, expect } from '../../src/fixtures';
import { CATEGORIES, PRODUCTS, SEED_PRODUCTS } from '../../src/data/testData';
import { money } from '../../src/utils/pricing';

test.describe('Home & navigation', () => {
  test('home page shows hero, categories and featured products @smoke', async ({ page, homePage }) => {
    await homePage.goto();
    await expect(page).toHaveTitle('ShopVerse');
    await expect(homePage.hero).toContainText('Free shipping on orders over $100');
    await expect(homePage.hero).toContainText('SAVE10');

    for (const c of CATEGORIES) await expect(homePage.categoryTile(c)).toBeVisible();

    const featured = SEED_PRODUCTS.filter((p) => p.featured).map((p) => p.name).sort();
    await expect(homePage.featuredCards).toHaveCount(featured.length);
    expect((await homePage.featuredCards.getByTestId('product-name').allInnerTexts()).sort()).toEqual(featured);
  });

  test('a category tile opens the filtered catalogue', async ({ page, homePage, productsPage }) => {
    await homePage.goto();
    await homePage.categoryTile('Books').click();
    await expect(page).toHaveURL(/\/products\?category=Books$/);
    await productsPage.waitForResults();
    await expect(productsPage.categoryFilter).toHaveValue('Books');
    await productsPage.expectCount(SEED_PRODUCTS.filter((p) => p.category === 'Books').length);
  });

  test('"Shop now" goes to all products', async ({ page, homePage, productsPage }) => {
    await homePage.goto();
    await homePage.shopNow.click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(productsPage.heading).toHaveText('All products');
  });

  test('navbar search shows matching products', async ({ page, homePage, productsPage }) => {
    await homePage.goto();
    await homePage.navbar.search('  SoundMax ');
    await expect(page).toHaveURL(/\/products\?search=SoundMax$/);
    await productsPage.waitForResults();
    await expect(productsPage.heading).toHaveText('Results for "SoundMax"');
    await productsPage.expectCount(2);
    expect((await productsPage.names()).sort()).toEqual([PRODUCTS.headphones.name, PRODUCTS.speaker.name].sort());
  });

  test('an empty search shows every product', async ({ page, homePage }) => {
    await homePage.goto();
    await homePage.navbar.search('   ');
    await expect(page).toHaveURL(/\/products$/);
  });

  test('a product card opens its detail page', async ({ page, productsPage, productPage }) => {
    await productsPage.goto({ search: 'Atomic' });
    await productsPage.card(PRODUCTS.atomicHabits.name).getByRole('link', { name: PRODUCTS.atomicHabits.name }).click();
    await expect(page).toHaveURL(`/products/${PRODUCTS.atomicHabits.slug}`);
    await expect(productPage.name).toHaveText(PRODUCTS.atomicHabits.name);
    await expect(productPage.price).toHaveText(money(PRODUCTS.atomicHabits.price));
  });

  test('breadcrumb links back to the category', async ({ page, productPage, productsPage }) => {
    await productPage.goto(PRODUCTS.cleanCode.slug);
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Books' }).click();
    await expect(page).toHaveURL(/category=Books/);
    await productsPage.waitForResults();
    await expect(productsPage.categoryFilter).toHaveValue('Books');
  });

  test('unknown routes show the 404 page', async ({ page }) => {
    await page.goto('/this/does/not/exist');
    await expect(page.getByTestId('not-found')).toContainText('404 - Page not found');
    await page.getByRole('link', { name: 'Go home' }).click();
    await expect(page).toHaveURL('/');
  });

  test('unknown product slug shows "Product not found"', async ({ productPage }) => {
    await productPage.goto('no-such-product-123');
    await expect(productPage.notFound).toBeVisible();
    await expect(productPage.notFound.getByRole('link', { name: 'Back to products' })).toBeVisible();
  });

  test('guest sees Login / Register and a zero cart badge', async ({ homePage }) => {
    await homePage.goto();
    await homePage.navbar.expectLoggedOut();
    await expect(homePage.navbar.cartCount).toHaveText('0');
    await expect(homePage.navbar.adminLink).toBeHidden();
  });
});
