import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly root: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('login-page');
    this.email = page.getByTestId('login-email');
    this.password = page.getByTestId('login-password');
    this.submit = page.getByTestId('login-submit');
    this.error = page.getByTestId('login-error');
    this.registerLink = page.getByTestId('goto-register');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
