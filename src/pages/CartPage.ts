import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { Totals, money, shippingLabel } from '../utils/pricing';

export class CartPage extends BasePage {
  readonly root: Locator;
  readonly emptyCart: Locator;
  readonly continueShopping: Locator;
  readonly items: Locator;
  readonly couponInput: Locator;
  readonly applyCouponButton: Locator;
  readonly couponError: Locator;
  readonly couponWarning: Locator;
  readonly couponApplied: Locator;
  readonly removeCouponButton: Locator;
  readonly checkoutButton: Locator;
  readonly summary: {
    root: Locator;
    items: Locator;
    discount: Locator;
    shipping: Locator;
    tax: Locator;
    total: Locator;
  };

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('cart-page');
    this.emptyCart = page.getByTestId('empty-cart');
    this.continueShopping = page.getByTestId('continue-shopping');
    this.items = page.getByTestId('cart-item');
    this.couponInput = page.getByTestId('coupon-input');
    this.applyCouponButton = page.getByTestId('apply-coupon');
    this.couponError = page.getByTestId('coupon-error');
    this.couponWarning = page.getByTestId('coupon-warning');
    this.couponApplied = page.getByTestId('coupon-applied');
    this.removeCouponButton = page.getByTestId('remove-coupon');
    this.checkoutButton = page.getByTestId('checkout-button');
    this.summary = {
      root: page.getByTestId('order-summary'),
      items: page.getByTestId('summary-items'),
      discount: page.getByTestId('summary-discount'),
      shipping: page.getByTestId('summary-shipping'),
      tax: page.getByTestId('summary-tax'),
      total: page.getByTestId('summary-total'),
    };
  }

  async goto() {
    await this.page.goto('/cart');
    await this.waitUntilLoaded();
    await expect(this.root.or(this.emptyCart)).toBeVisible();
  }

  item(name: string) {
    return this.items.filter({ has: this.page.getByTestId('cart-item-name').getByText(name, { exact: true }) });
  }

  quantityOf(name: string) {
    return this.item(name).getByTestId('cart-item-qty');
  }

  subtotalOf(name: string) {
    return this.item(name).getByTestId('cart-item-subtotal');
  }

  increaseButton(name: string) {
    return this.item(name).getByTestId('qty-increase');
  }

  decreaseButton(name: string) {
    return this.item(name).getByTestId('qty-decrease');
  }

  /** Click + and wait for the quantity to change. */
  async increase(name: string) {
    const before = Number(await this.quantityOf(name).innerText());
    await this.increaseButton(name).click();
    await expect(this.quantityOf(name)).toHaveText(String(before + 1));
  }

  async decrease(name: string) {
    const before = Number(await this.quantityOf(name).innerText());
    await this.decreaseButton(name).click();
    await expect(this.quantityOf(name)).toHaveText(String(before - 1));
  }

  async remove(name: string) {
    await this.item(name).getByTestId('remove-item').click();
    await expect(this.item(name)).toHaveCount(0);
  }

  async applyCoupon(code: string) {
    await this.couponInput.fill(code);
    await this.applyCouponButton.click();
  }

  /** Assert every line of the order summary against the pricing oracle. */
  async expectSummary(t: Totals) {
    await expect(this.summary.items).toHaveText(money(t.itemsPrice));
    if (t.discount > 0) await expect(this.summary.discount).toHaveText(`-${money(t.discount)}`);
    else await expect(this.summary.discount).toHaveCount(0);
    await expect(this.summary.shipping).toHaveText(shippingLabel(t));
    await expect(this.summary.tax).toHaveText(money(t.taxPrice));
    await expect(this.summary.total).toHaveText(money(t.totalPrice));
  }
}
