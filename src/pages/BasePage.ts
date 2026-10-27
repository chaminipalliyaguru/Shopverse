import { Locator, Page, expect } from '@playwright/test';

export class Navbar {
  readonly root: Locator;
  readonly brand: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly productsLink: Locator;
  readonly cartLink: Locator;
  readonly cartCount: Locator;
  readonly loginLink: Locator;
  readonly registerLink: Locator;
  readonly logoutButton: Locator;
  readonly ordersLink: Locator;
  readonly adminLink: Locator;
  readonly profileLink: Locator;

  constructor(readonly page: Page) {
    this.root = page.getByTestId('navbar');
    this.brand = page.getByTestId('nav-brand');
    this.searchInput = page.getByTestId('search-input');
    this.searchButton = page.getByTestId('search-button');
    this.productsLink = page.getByTestId('nav-products');
    this.cartLink = page.getByTestId('nav-cart');
    this.cartCount = page.getByTestId('cart-count');
    this.loginLink = page.getByTestId('nav-login');
    this.registerLink = page.getByTestId('nav-register');
    this.logoutButton = page.getByTestId('nav-logout');
    this.ordersLink = page.getByTestId('nav-orders');
    this.adminLink = page.getByTestId('nav-admin');
    this.profileLink = page.getByTestId('nav-profile');
  }

  async search(term: string) {
    await this.searchInput.fill(term);
    await this.searchButton.click();
  }

  async expectLoggedInAs(name: string) {
    await expect(this.profileLink).toHaveText(name);
    await expect(this.logoutButton).toBeVisible();
    await expect(this.loginLink).toBeHidden();
  }

  async expectLoggedOut() {
    await expect(this.loginLink).toBeVisible();
    await expect(this.registerLink).toBeVisible();
    await expect(this.logoutButton).toBeHidden();
  }
}

export abstract class BasePage {
  readonly navbar: Navbar;

  constructor(readonly page: Page) {
    this.navbar = new Navbar(page);
  }

  toast(type: 'success' | 'error', text?: string | RegExp): Locator {
    const t = this.page.getByTestId(`toast-${type}`);
    return text ? t.filter({ hasText: text }) : t;
  }

  /** Most pages render a "Loading..." placeholder first. */
  async waitUntilLoaded() {
    await expect(this.page.getByTestId('loading')).toHaveCount(0);
  }
}
