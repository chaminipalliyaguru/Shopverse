import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import type { Address } from '../data/testData';

export class CheckoutPage extends BasePage {
  readonly root: Locator;
  readonly emptyCart: Locator;
  readonly payByCard: Locator;
  readonly payByCod: Locator;
  readonly cardFields: Locator;
  readonly cardNumber: Locator;
  readonly cardExpiry: Locator;
  readonly cardCvc: Locator;
  readonly placeOrderButton: Locator;
  readonly serverError: Locator;
  readonly summaryTotal: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('checkout-page');
    this.emptyCart = page.getByTestId('empty-cart');
    this.payByCard = page.getByTestId('pay-card');
    this.payByCod = page.getByTestId('pay-cod');
    this.cardFields = page.getByTestId('card-fields');
    this.cardNumber = page.getByTestId('card-number');
    this.cardExpiry = page.getByTestId('card-expiry');
    this.cardCvc = page.getByTestId('card-cvc');
    this.placeOrderButton = page.getByTestId('place-order');
    this.serverError = page.getByTestId('checkout-error');
    this.summaryTotal = page.getByTestId('summary-total');
  }

  async goto() {
    await this.page.goto('/checkout');
    await this.waitUntilLoaded();
    await expect(this.root.or(this.emptyCart)).toBeVisible();
  }

  addressField(field: keyof Address) {
    return this.page.getByTestId(`ship-${field}`);
  }

  fieldError(field: keyof Address | 'card-number' | 'card-expiry' | 'card-cvc') {
    return this.page.getByTestId(`error-${field}`);
  }

  async fillAddress(address: Partial<Address>) {
    for (const [k, v] of Object.entries(address) as [keyof Address, string][]) {
      await this.addressField(k).fill(v);
    }
  }

  async payWithCard(number: string, expiry: string, cvc = '123') {
    await this.payByCard.check();
    await this.cardNumber.fill(number);
    await this.cardExpiry.fill(expiry);
    await this.cardCvc.fill(cvc);
  }

  async payCashOnDelivery() {
    await this.payByCod.check();
  }

  async placeOrder() {
    await this.placeOrderButton.click();
  }
}
