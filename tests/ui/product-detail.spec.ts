import { test, expect } from '../../src/fixtures';
import { MAX_QTY_PER_ITEM, PRODUCTS } from '../../src/data/testData';
import { money } from '../../src/utils/pricing';

test.describe('Product detail', () => {
  test('shows product information @smoke', async ({ productPage }) => {
    const p = PRODUCTS.headphones;
    await productPage.goto(p.slug);
    await expect(productPage.name).toHaveText(p.name);
    await expect(productPage.brand).toHaveText(p.brand);
    await expect(productPage.category).toHaveText(p.category);
    await expect(productPage.price).toHaveText(money(p.price));
    await expect(productPage.description).toContainText('noise cancellation');
    await expect(productPage.stockStatus).toHaveText('In stock');
    await expect(productPage.page.getByTestId('detail-image')).toHaveAttribute('alt', p.name);
  });

  test(`quantity picker is capped at ${MAX_QTY_PER_ITEM}`, async ({ productPage }) => {
    await productPage.goto(PRODUCTS.tshirt.slug); // stock 200
    await expect(productPage.quantity.locator('option')).toHaveCount(MAX_QTY_PER_ITEM);
  });

  test('low stock shows a warning and caps the quantity picker', async ({ productPage, tempProduct }) => {
    const p = await tempProduct({ stock: 3 });
    await productPage.goto(p.slug);
    await expect(productPage.stockStatus).toHaveText('Only 3 left in stock!');
    await expect(productPage.quantity.locator('option')).toHaveText(['1', '2', '3']);
  });

  test('out of stock: no picker, disabled button', async ({ productPage }) => {
    await productPage.goto(PRODUCTS.keyboardOutOfStock.slug);
    await expect(productPage.stockStatus).toHaveText('Out of stock');
    await expect(productPage.quantity).toHaveCount(0);
    await expect(productPage.addToCartButton).toBeDisabled();
    await expect(productPage.addToCartButton).toHaveText('Out of stock');
  });

  test('guest is sent to login, then back to the product', async ({ page, productPage, loginPage, createUser }) => {
    const user = await createUser();
    await productPage.goto(PRODUCTS.cleanCode.slug);
    await productPage.addToCart();
    await expect(page).toHaveURL('/login');
    await loginPage.login(user.email, user.password);
    await expect(page).toHaveURL(`/products/${PRODUCTS.cleanCode.slug}`);
  });

  test('adds the chosen quantity to the cart', async ({ signedInUser, productPage }) => {
    await productPage.goto(PRODUCTS.yogaMat.slug);
    await productPage.addToCart(3);
    await expect(productPage.toast('success', `${PRODUCTS.yogaMat.name} added to cart`)).toBeVisible();
    await expect(productPage.navbar.cartCount).toHaveText('3');
    const cart = await signedInUser.api.cart();
    expect(cart.items).toEqual([expect.objectContaining({ name: PRODUCTS.yogaMat.name, quantity: 3 })]);
  });

  test('server-side stock limit is shown as an error toast', async ({ signedInUser, productPage, tempProduct }) => {
    const p = await tempProduct({ stock: 2 });
    await signedInUser.api.addToCart(p._id, 2);
    await productPage.goto(p.slug);
    await productPage.addToCart(1);
    await expect(productPage.toast('error', 'Only 2 left in stock')).toBeVisible();
  });

  test('guests are invited to log in instead of seeing the review form', async ({ productPage }) => {
    await productPage.goto(PRODUCTS.cleanCode.slug);
    await expect(productPage.reviewForm).toHaveCount(0);
    await expect(productPage.page.getByTestId('reviews-section')).toContainText('Log in to write a review.');
  });
});
