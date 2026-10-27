import { test, expect } from '../../src/fixtures';
import { COUPONS, INVALID_COUPONS, MAX_QTY_PER_ITEM, PRODUCTS } from '../../src/data/testData';
import { expectedTotals, money } from '../../src/utils/pricing';

test.describe('Shopping cart', () => {
  test('empty cart state', async ({ page, signedInUser, cartPage }) => {
    void signedInUser;
    await cartPage.goto();
    await expect(cartPage.emptyCart).toContainText('Your cart is empty');
    await cartPage.continueShopping.click();
    await expect(page).toHaveURL('/products');
  });

  test('line items and summary match the pricing rules @smoke', async ({ signedInUser, cartPage }) => {
    await signedInUser.api.addSlugToCart(PRODUCTS.speaker.slug, 1); // 45.00
    await signedInUser.api.addSlugToCart(PRODUCTS.atomicHabits.slug, 2); // 2 x 16.99

    await cartPage.goto();
    await expect(cartPage.items).toHaveCount(2);
    await expect(cartPage.quantityOf(PRODUCTS.atomicHabits.name)).toHaveText('2');
    await expect(cartPage.subtotalOf(PRODUCTS.atomicHabits.name)).toHaveText(money(33.98));
    await expect(cartPage.navbar.cartCount).toHaveText('3');

    await cartPage.expectSummary(
      expectedTotals([
        { price: PRODUCTS.speaker.price, quantity: 1 },
        { price: PRODUCTS.atomicHabits.price, quantity: 2 },
      ])
    );
  });

  test('increase / decrease quantity recalculates totals', async ({ signedInUser, cartPage }) => {
    const p = PRODUCTS.speaker;
    await signedInUser.api.addSlugToCart(p.slug, 1);
    await cartPage.goto();
    await expect(cartPage.decreaseButton(p.name)).toBeDisabled(); // can't go below 1

    await cartPage.increase(p.name);
    await cartPage.increase(p.name);
    await expect(cartPage.subtotalOf(p.name)).toHaveText(money(135));
    await cartPage.expectSummary(expectedTotals([{ price: p.price, quantity: 3 }])); // 135 -> free shipping
    await expect(cartPage.navbar.cartCount).toHaveText('3');

    await cartPage.decrease(p.name);
    await cartPage.expectSummary(expectedTotals([{ price: p.price, quantity: 2 }])); // 90 -> $5.99 shipping
  });

  test(`"+" is disabled at ${MAX_QTY_PER_ITEM} units`, async ({ signedInUser, cartPage }) => {
    await signedInUser.api.addSlugToCart(PRODUCTS.tshirt.slug, MAX_QTY_PER_ITEM);
    await cartPage.goto();
    await expect(cartPage.quantityOf(PRODUCTS.tshirt.name)).toHaveText(String(MAX_QTY_PER_ITEM));
    await expect(cartPage.increaseButton(PRODUCTS.tshirt.name)).toBeDisabled();
  });

  test('"+" is disabled at the available stock', async ({ signedInUser, cartPage, tempProduct }) => {
    const p = await tempProduct({ stock: 2 });
    await signedInUser.api.addToCart(p._id, 1);
    await cartPage.goto();
    await cartPage.increase(p.name);
    await expect(cartPage.increaseButton(p.name)).toBeDisabled();
  });

  test('removing the last item shows the empty state', async ({ signedInUser, cartPage }) => {
    await signedInUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
    await cartPage.goto();
    await cartPage.remove(PRODUCTS.cleanCode.name);
    await expect(cartPage.emptyCart).toBeVisible();
    await expect(cartPage.navbar.cartCount).toHaveText('0');
  });

  test('cart is stored server-side and survives logout/login', async ({ page, freshUser, loginPage, cartPage }) => {
    await freshUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 2);
    await loginPage.goto();
    await loginPage.login(freshUser.email, freshUser.password);
    await expect(loginPage.navbar.cartCount).toHaveText('2');

    await loginPage.navbar.logoutButton.click();
    await expect(loginPage.navbar.cartCount).toHaveText('0');

    await page.goto('/login');
    await loginPage.login(freshUser.email, freshUser.password);
    await cartPage.goto();
    await expect(cartPage.quantityOf(PRODUCTS.cleanCode.name)).toHaveText('2');
  });

  test('"Proceed to checkout" opens checkout', async ({ page, signedInUser, cartPage, checkoutPage }) => {
    await signedInUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
    await cartPage.goto();
    await cartPage.checkoutButton.click();
    await expect(page).toHaveURL('/checkout');
    await expect(checkoutPage.root).toBeVisible();
  });

  test.describe('coupons', () => {
    test('SAVE10 applies a 10% discount and can be removed @smoke', async ({ signedInUser, cartPage }) => {
      const lines = [{ price: PRODUCTS.headphones.price, quantity: 1 }];
      await signedInUser.api.addSlugToCart(PRODUCTS.headphones.slug, 1);
      await cartPage.goto();

      await cartPage.applyCoupon('save10');
      await expect(cartPage.toast('success', 'Coupon applied')).toBeVisible();
      await expect(cartPage.couponApplied).toContainText('Coupon SAVE10 applied');
      await expect(cartPage.couponInput).toHaveValue('');
      await cartPage.expectSummary(expectedTotals(lines, COUPONS.save10));

      await cartPage.removeCouponButton.click();
      await expect(cartPage.couponApplied).toBeHidden();
      await cartPage.expectSummary(expectedTotals(lines));
    });

    test('FLAT15 takes $15 off', async ({ signedInUser, cartPage }) => {
      const lines = [{ price: PRODUCTS.speaker.price, quantity: 1 }];
      await signedInUser.api.addSlugToCart(PRODUCTS.speaker.slug, 1);
      await cartPage.goto();
      await cartPage.applyCoupon(COUPONS.flat15.code);
      await expect(cartPage.summary.discount).toHaveText('-$15.00');
      await cartPage.expectSummary(expectedTotals(lines, COUPONS.flat15));
    });

    for (const [name, c] of Object.entries(INVALID_COUPONS)) {
      test(`${name} coupon shows "${c.message}"`, async ({ signedInUser, cartPage }) => {
        await signedInUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
        await cartPage.goto();
        await cartPage.applyCoupon(c.code);
        await expect(cartPage.couponError).toHaveText(c.message);
        await expect(cartPage.couponApplied).toBeHidden();
        await expect(cartPage.summary.discount).toHaveCount(0);
      });
    }

    test('WELCOME20 below its $50 minimum is refused', async ({ signedInUser, cartPage }) => {
      await signedInUser.api.addSlugToCart(PRODUCTS.atomicHabits.slug, 1);
      await cartPage.goto();
      await cartPage.applyCoupon(COUPONS.welcome20.code);
      await expect(cartPage.couponError).toHaveText('Coupon requires a minimum order of $50.00');
    });

    test('a coupon that stops qualifying shows a warning and stops discounting', async ({ signedInUser, cartPage }) => {
      const p = PRODUCTS.atomicHabits;
      await signedInUser.api.addSlugToCart(p.slug, 3); // 50.97
      await cartPage.goto();
      await cartPage.applyCoupon(COUPONS.welcome20.code);
      await expect(cartPage.couponApplied).toBeVisible();

      await cartPage.decrease(p.name); // 33.98
      await expect(cartPage.couponWarning).toHaveText('Coupon requires a minimum order of $50.00');
      await expect(cartPage.couponApplied).toBeHidden();
      await cartPage.expectSummary(expectedTotals([{ price: p.price, quantity: 2 }]));
    });
  });

  test.describe('shipping', () => {
    test('shipping is FREE from $100 and $5.99 below', async ({ signedInUser, cartPage }) => {
      const p = PRODUCTS.waterBottle; // $22
      await signedInUser.api.addSlugToCart(p.slug, 4); // 88
      await cartPage.goto();
      await expect(cartPage.summary.shipping).toHaveText('$5.99');
      await cartPage.increase(p.name); // 110
      await expect(cartPage.summary.shipping).toHaveText('FREE');
    });

    test('a discount can bring the order back under the free-shipping threshold', async ({ signedInUser, cartPage }) => {
      await signedInUser.api.addSlugToCart(PRODUCTS.waterBottle.slug, 5); // 110
      await cartPage.goto();
      await expect(cartPage.summary.shipping).toHaveText('FREE');
      await cartPage.applyCoupon(COUPONS.save10.code); // 99
      await cartPage.expectSummary({ itemsPrice: 110, discount: 11, shippingPrice: 5.99, taxPrice: 7.92, totalPrice: 112.91 });
    });
  });
});
