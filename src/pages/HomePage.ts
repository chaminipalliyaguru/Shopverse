import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  readonly hero: Locator;
  readonly shopNow: Locator;
  readonly categoryList: Locator;
  readonly featuredProducts: Locator;
  readonly featuredCards: Locator;

  constructor(page: Page) {
    super(page);
    this.hero = page.getByTestId('hero');
    this.shopNow = page.getByTestId('shop-now');
    this.categoryList = page.getByTestId('category-list');
    this.featuredProducts = page.getByTestId('featured-products');
    this.featuredCards = this.featuredProducts.getByTestId('product-card');
  }

  async goto() {
    await this.page.goto('/');
    await this.waitUntilLoaded();
  }

  categoryTile(category: string) {
    return this.page.getByTestId(`category-${category}`);
  }
}
