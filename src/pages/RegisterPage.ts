import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export interface RegisterForm {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

export class RegisterPage extends BasePage {
  readonly root: Locator;
  readonly name: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly confirm: Locator;
  readonly submit: Locator;
  readonly serverError: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('register-page');
    this.name = page.getByTestId('register-name');
    this.email = page.getByTestId('register-email');
    this.password = page.getByTestId('register-password');
    this.confirm = page.getByTestId('register-confirm');
    this.submit = page.getByTestId('register-submit');
    this.serverError = page.getByTestId('register-error');
  }

  async goto() {
    await this.page.goto('/register');
  }

  fieldError(field: 'name' | 'email' | 'password' | 'confirm') {
    return this.page.getByTestId(`error-${field}`);
  }

  async register(form: RegisterForm) {
    if (form.name !== undefined) await this.name.fill(form.name);
    if (form.email !== undefined) await this.email.fill(form.email);
    if (form.password !== undefined) await this.password.fill(form.password);
    if (form.confirm !== undefined) await this.confirm.fill(form.confirm);
    await this.submit.click();
  }
}
