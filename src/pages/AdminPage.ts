import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export interface ProductFormData {
  name?: string;
  category?: string;
  brand?: string;
  price?: number | string;
  stock?: number | string;
  image?: string;
  description?: string;
}

export class AdminPage extends BasePage {
  readonly root: Locator;
  readonly forbidden: Locator;
  readonly tabs: { dashboard: Locator; products: Locator; orders: Locator };
  readonly stats: { root: Locator; users: Locator; products: Locator; orders: Locator; revenue: Locator };
  readonly productForm: {
    root: Locator;
    name: Locator;
    category: Locator;
    brand: Locator;
    price: Locator;
    stock: Locator;
    image: Locator;
    description: Locator;
    submit: Locator;
    cancel: Locator;
    error: Locator;
  };
  readonly productRows: Locator;
  readonly orderRows: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('admin-page');
    this.forbidden = page.getByTestId('forbidden');
    this.tabs = {
      dashboard: page.getByTestId('admin-tab-dashboard'),
      products: page.getByTestId('admin-tab-products'),
      orders: page.getByTestId('admin-tab-orders'),
    };
    this.stats = {
      root: page.getByTestId('admin-dashboard'),
      users: page.getByTestId('stat-users'),
      products: page.getByTestId('stat-products'),
      orders: page.getByTestId('stat-orders'),
      revenue: page.getByTestId('stat-revenue'),
    };
    this.productForm = {
      root: page.getByTestId('product-form'),
      name: page.getByTestId('pf-name'),
      category: page.getByTestId('pf-category'),
      brand: page.getByTestId('pf-brand'),
      price: page.getByTestId('pf-price'),
      stock: page.getByTestId('pf-stock'),
      image: page.getByTestId('pf-image'),
      description: page.getByTestId('pf-description'),
      submit: page.getByTestId('pf-submit'),
      cancel: page.getByTestId('pf-cancel'),
      error: page.getByTestId('pf-error'),
    };
    this.productRows = page.getByTestId('admin-product-row');
    this.orderRows = page.getByTestId('admin-order-row');
  }

  async gotoDashboard() {
    await this.page.goto('/admin');
    await expect(this.stats.root.or(this.forbidden)).toBeVisible();
  }

  async gotoProducts() {
    await this.page.goto('/admin/products');
    await expect(this.page.getByTestId('admin-products-table')).toBeVisible();
    await expect(this.productRows.first()).toBeVisible();
  }

  async gotoOrders() {
    await this.page.goto('/admin/orders');
    await expect(this.page.getByTestId('admin-orders-table')).toBeVisible();
  }

  productRow(name: string) {
    return this.productRows.filter({ has: this.page.getByTestId('ap-name').getByText(name, { exact: true }) });
  }

  orderRow(orderNumber: string) {
    return this.orderRows.filter({ has: this.page.getByTestId('ao-number').getByText(orderNumber, { exact: true }) });
  }

  async fillProductForm(data: ProductFormData) {
    const f = this.productForm;
    const map: [keyof ProductFormData, Locator][] = [
      ['name', f.name],
      ['category', f.category],
      ['brand', f.brand],
      ['price', f.price],
      ['stock', f.stock],
      ['image', f.image],
      ['description', f.description],
    ];
    for (const [key, locator] of map) {
      if (data[key] !== undefined) await locator.fill(String(data[key]));
    }
  }

  async editProduct(name: string) {
    await this.productRow(name).getByTestId('ap-edit').click();
    await expect(this.productForm.submit).toHaveText('Update');
  }

  /** Delete via the row button; `confirm` decides how the window.confirm dialog is answered. */
  async deleteProduct(name: string, confirm = true) {
    this.page.once('dialog', (d) => (confirm ? d.accept() : d.dismiss()));
    await this.productRow(name).getByTestId('ap-delete').click();
  }

  async setOrderStatus(orderNumber: string, status: string) {
    await this.orderRow(orderNumber).getByTestId('ao-status-select').selectOption(status);
  }
}
