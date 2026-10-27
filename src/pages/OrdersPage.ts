import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class OrdersPage extends BasePage {
  readonly root: Locator;
  readonly noOrders: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('orders-page');
    this.noOrders = page.getByTestId('no-orders');
    this.rows = page.getByTestId('order-row');
  }

  async goto() {
    await this.page.goto('/orders');
    await this.waitUntilLoaded();
    await expect(this.root).toBeVisible();
  }

  row(orderNumber: string) {
    return this.rows.filter({ has: this.page.getByTestId('order-number').getByText(orderNumber, { exact: true }) });
  }

  async open(orderNumber: string) {
    await this.row(orderNumber).getByTestId('view-order').click();
  }
}

export class OrderDetailPage extends BasePage {
  readonly root: Locator;
  readonly successBanner: Locator;
  readonly orderNumber: Locator;
  readonly status: Locator;
  readonly items: Locator;
  readonly address: Locator;
  readonly discount: Locator;
  readonly grandTotal: Locator;
  readonly cancelButton: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('order-detail');
    this.successBanner = page.getByTestId('order-success');
    this.orderNumber = this.root.getByTestId('order-number');
    this.status = this.root.getByTestId('order-status');
    this.items = page.getByTestId('order-item');
    this.address = page.getByTestId('order-address');
    this.discount = page.getByTestId('order-discount');
    this.grandTotal = page.getByTestId('order-grand-total');
    this.cancelButton = page.getByTestId('cancel-order');
    this.error = page.getByTestId('order-error');
  }

  async goto(orderId: string) {
    await this.page.goto(`/orders/${orderId}`);
    await expect(this.root.or(this.error)).toBeVisible();
  }

  /** The order id is the last URL segment on /orders/:id */
  orderIdFromUrl() {
    return new URL(this.page.url()).pathname.split('/').pop()!;
  }
}
