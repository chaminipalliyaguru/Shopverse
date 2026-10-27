import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import type { Address } from '../data/testData';

export class ProfilePage extends BasePage {
  readonly root: Locator;
  readonly email: Locator;
  readonly name: Locator;
  readonly password: Locator;
  readonly save: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('profile-page');
    this.email = page.getByTestId('profile-email');
    this.name = page.getByTestId('profile-name');
    this.password = page.getByTestId('profile-password');
    this.save = page.getByTestId('profile-save');
    this.error = page.getByTestId('profile-error');
  }

  async goto() {
    await this.page.goto('/profile');
    await this.waitUntilLoaded();
    await expect(this.root).toBeVisible();
  }

  addressField(field: keyof Address) {
    return this.page.getByTestId(`profile-${field}`);
  }

  async fillAddress(address: Address) {
    for (const [k, v] of Object.entries(address) as [keyof Address, string][]) {
      await this.addressField(k).fill(v);
    }
  }
}
