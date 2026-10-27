import { test, expect } from '../../src/fixtures';
import { ADDRESS_LABELS, Address, CARDS, CARD_MESSAGES, COUPONS, PRODUCTS, VALID_ADDRESS, futureExpiry } from '../../src/data/testData';
import { expectedTotals, money } from '../../src/utils/pricing';

test.describe('Checkout', () => {
  test('empty cart cannot be checked out', async ({ signedInUser, checkoutPage }) => {
    void signedInUser;
    await checkoutPage.goto();
    await expect(checkoutPage.emptyCart).toBeVisible();
    await expect(checkoutPage.placeOrderButton).toHaveCount(0);
  });

  test.describe('form validation', () => {
    test.beforeEach(async ({ signedInUser, checkoutPage }) => {
      await signedInUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
      await checkoutPage.goto();
    });

    test('full name is pre-filled from the account', async ({ signedInUser, checkoutPage }) => {
      await expect(checkoutPage.addressField('fullName')).toHaveValue(signedInUser.name);
    });

    test('every address field is required', async ({ page, checkoutPage }) => {
      let ordered = false;
      await page.route('**/api/orders', (route) => ((ordered = true), route.continue()));
      await checkoutPage.addressField('fullName').fill('');
      await checkoutPage.payCashOnDelivery();
      await checkoutPage.placeOrder();
      for (const [field, label] of Object.entries(ADDRESS_LABELS) as [keyof Address, string][]) {
        await expect(checkoutPage.fieldError(field)).toHaveText(`${label} is required`);
      }
      expect(ordered).toBe(false);
    });

    test('phone number format is checked', async ({ checkoutPage }) => {
      await checkoutPage.fillAddress({ ...VALID_ADDRESS, phone: 'abc' });
      await checkoutPage.payCashOnDelivery();
      await checkoutPage.placeOrder();
      await expect(checkoutPage.fieldError('phone')).toHaveText('Enter a valid phone number');
    });

    test('card fields are validated before calling the API', async ({ checkoutPage }) => {
      await checkoutPage.fillAddress(VALID_ADDRESS);
      await checkoutPage.payWithCard('4242', '2030-12', '1');
      await checkoutPage.placeOrder();
      await expect(checkoutPage.fieldError('card-number')).toHaveText('Card number must be 16 digits');
      await expect(checkoutPage.fieldError('card-expiry')).toHaveText('Use MM/YY format');
      await expect(checkoutPage.fieldError('card-cvc')).toHaveText('CVC must be 3 or 4 digits');
    });

    test('card fields are hidden for cash on delivery', async ({ checkoutPage }) => {
      await expect(checkoutPage.payByCard).toBeChecked();
      await expect(checkoutPage.cardFields).toBeVisible();
      await checkoutPage.payCashOnDelivery();
      await expect(checkoutPage.cardFields).toBeHidden();
    });
  });

  test('pay by card: order confirmed, stock reduced, cart emptied @smoke', async ({ page, signedInUser, checkoutPage, orderPage, tempProduct, db }) => {
    const product = await tempProduct({ price: 42.5, stock: 10 });
    await signedInUser.api.addToCart(product._id, 2);
    const totals = expectedTotals([{ price: 42.5, quantity: 2 }]);

    await checkoutPage.goto();
    await expect(checkoutPage.summaryTotal).toHaveText(money(totals.totalPrice));
    await checkoutPage.fillAddress(VALID_ADDRESS);
    await checkoutPage.payWithCard(CARDS.success, futureExpiry(), '123');
    await checkoutPage.placeOrder();

    await expect(page).toHaveURL(/\/orders\/[0-9a-f]{24}$/);
    await expect(orderPage.successBanner).toContainText('Thank you! Your order has been placed.');
    await expect(orderPage.status).toHaveText('paid');
    await expect(orderPage.grandTotal).toHaveText(money(totals.totalPrice));
    await expect(orderPage.items).toHaveCount(1);
    await expect(orderPage.address).toContainText(VALID_ADDRESS.street);
    await expect(orderPage.root).toContainText('Payment: Card · Paid');
    await expect(orderPage.navbar.cartCount).toHaveText('0');

    // database checks
    const orderNumber = await orderPage.orderNumber.innerText();
    const saved = await db.findOrderByNumber(orderNumber);
    expect(saved).toMatchObject({ status: 'paid', isPaid: true, paymentMethod: 'card', totalPrice: totals.totalPrice });
    expect(await db.productStock(product.slug)).toBe(8);
    expect((await db.cartForEmail(signedInUser.email))?.items).toEqual([]);
  });

  test('cash on delivery: order is pending and unpaid', async ({ page, signedInUser, checkoutPage, orderPage }) => {
    await signedInUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
    await checkoutPage.goto();
    await checkoutPage.fillAddress(VALID_ADDRESS);
    await checkoutPage.payCashOnDelivery();
    await checkoutPage.placeOrder();

    await expect(page).toHaveURL(/\/orders\//);
    await expect(orderPage.status).toHaveText('pending');
    await expect(orderPage.root).toContainText('Payment: Cash on delivery · Not paid');
  });

  test('coupon discount is carried through to the order', async ({ signedInUser, checkoutPage, orderPage }) => {
    const lines = [{ price: PRODUCTS.headphones.price, quantity: 1 }];
    await signedInUser.api.addSlugToCart(PRODUCTS.headphones.slug, 1);
    await signedInUser.api.applyCoupon(COUPONS.save10.code);
    const totals = expectedTotals(lines, COUPONS.save10);

    await checkoutPage.goto();
    await expect(checkoutPage.page.getByTestId('summary-discount')).toHaveText(`-${money(totals.discount)}`);
    await checkoutPage.fillAddress(VALID_ADDRESS);
    await checkoutPage.payCashOnDelivery();
    await checkoutPage.placeOrder();

    await expect(orderPage.discount).toHaveText(`-${money(totals.discount)}`);
    await expect(orderPage.grandTotal).toHaveText(money(totals.totalPrice));
  });

  const declined = [
    { title: 'declined card', number: CARDS.declined, expiry: futureExpiry(), message: CARD_MESSAGES.declined },
    { title: 'insufficient funds', number: CARDS.insufficientFunds, expiry: futureExpiry(), message: CARD_MESSAGES.insufficientFunds },
    { title: 'unknown card', number: CARDS.unknown, expiry: futureExpiry(), message: CARD_MESSAGES.invalid },
    { title: 'expired card', number: CARDS.success, expiry: '01/20', message: CARD_MESSAGES.expired },
  ];
  for (const c of declined) {
    test(`payment failure: ${c.title}`, async ({ page, signedInUser, checkoutPage }) => {
      await signedInUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
      await checkoutPage.goto();
      await checkoutPage.fillAddress(VALID_ADDRESS);
      await checkoutPage.payWithCard(c.number, c.expiry);
      await checkoutPage.placeOrder();

      await expect(checkoutPage.serverError).toHaveText(c.message);
      await expect(page).toHaveURL('/checkout');
      await expect(checkoutPage.placeOrderButton).toBeEnabled();
      expect((await signedInUser.api.cart()).itemCount).toBe(1);
      expect(await signedInUser.api.myOrders()).toHaveLength(0);
    });
  }

  test('stock running out during checkout is reported', async ({ signedInUser, adminApi, checkoutPage, tempProduct }) => {
    const p = await tempProduct({ stock: 3 });
    await signedInUser.api.addToCart(p._id, 3);
    await checkoutPage.goto();
    await checkoutPage.fillAddress(VALID_ADDRESS);
    await checkoutPage.payCashOnDelivery();

    await adminApi.adminUpdateProduct(p._id, { stock: 1 }); // someone else bought 2 meanwhile
    await checkoutPage.placeOrder();
    await expect(checkoutPage.serverError).toHaveText(`Not enough stock for "${p.name}"`);
  });

  test('saved profile address pre-fills the checkout form', async ({ signedInUser, checkoutPage }) => {
    const address: Address = { ...VALID_ADDRESS, fullName: 'Saved Address', city: 'Galle' };
    await signedInUser.api.updateProfile({ address });
    await signedInUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);

    await checkoutPage.goto();
    for (const [field, value] of Object.entries(address) as [keyof Address, string][]) {
      await expect(checkoutPage.addressField(field)).toHaveValue(value);
    }
  });

  test('double-clicking "Place order" creates only one order', async ({ signedInUser, checkoutPage, page }) => {
    await signedInUser.api.addSlugToCart(PRODUCTS.cleanCode.slug, 1);
    await checkoutPage.goto();
    await checkoutPage.fillAddress(VALID_ADDRESS);
    await checkoutPage.payCashOnDelivery();
    await checkoutPage.placeOrderButton.dblclick();
    await expect(page).toHaveURL(/\/orders\//);
    expect(await signedInUser.api.myOrders()).toHaveLength(1);
  });
});
