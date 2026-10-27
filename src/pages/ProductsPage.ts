import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { parseMoney } from '../utils/pricing';

export type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'rating' | 'name';

export class ProductsPage extends BasePage {
  readonly root: Locator;
  readonly heading: Locator;
  readonly categoryFilter: Locator;
  readonly minPrice: Locator;
  readonly maxPrice: Locator;
  readonly applyPrice: Locator;
  readonly inStockOnly: Locator;
  readonly clearFilters: Locator;
  readonly sortSelect: Locator;
  readonly resultsCount: Locator;
  readonly noResults: Locator;
  readonly grid: Locator;
  readonly cards: Locator;
  readonly pagination: Locator;
  readonly nextPage: Locator;
  readonly prevPage: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('products-page');
    this.heading = page.getByTestId('results-heading');
    this.categoryFilter = page.getByTestId('filter-category');
    this.minPrice = page.getByTestId('filter-min-price');
    this.maxPrice = page.getByTestId('filter-max-price');
    this.applyPrice = page.getByTestId('apply-price');
    this.inStockOnly = page.getByTestId('filter-in-stock');
    this.clearFilters = page.getByTestId('clear-filters');
    this.sortSelect = page.getByTestId('sort-select');
    this.resultsCount = page.getByTestId('results-count');
    this.noResults = page.getByTestId('no-results');
    this.grid = page.getByTestId('product-grid');
    this.cards = this.grid.getByTestId('product-card');
    this.pagination = page.getByTestId('pagination');
    this.nextPage = page.getByTestId('next-page');
    this.prevPage = page.getByTestId('prev-page');
  }

  async goto(query: Record<string, string | number | boolean> = {}) {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    await this.page.goto(`/products${qs ? `?${qs}` : ''}`);
    await this.waitForResults();
  }

  /** Wait for the loading placeholder to go and either the grid or the empty state to show. */
  async waitForResults() {
    await this.waitUntilLoaded();
    await expect(this.grid.or(this.noResults)).toBeVisible();
  }

  /**
   * Run an action that changes the URL query, then wait for the matching /api/products request
   * to finish and the grid to re-render. Avoids reading stale cards from the previous result.
   */
  async reloadAfter(action: () => Promise<unknown>) {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && /\/api\/products\?/.test(r.url())
    );
    await action();
    await response;
    await this.waitForResults();
  }

  card(name: string) {
    return this.cards.filter({ has: this.page.getByTestId('product-name').getByText(name, { exact: true }) });
  }

  pageButton(n: number) {
    return this.page.getByTestId(`page-${n}`);
  }

  async names(): Promise<string[]> {
    return this.cards.getByTestId('product-name').allInnerTexts();
  }

  async prices(): Promise<number[]> {
    return (await this.cards.getByTestId('product-price').allInnerTexts()).map(parseMoney);
  }

  async categories(): Promise<string[]> {
    return this.cards.getByTestId('product-category').allInnerTexts();
  }

  async filterByCategory(category: string) {
    await this.reloadAfter(() => this.categoryFilter.selectOption(category));
  }

  async setPriceRange(min?: number, max?: number) {
    await this.minPrice.fill(min === undefined ? '' : String(min));
    await this.maxPrice.fill(max === undefined ? '' : String(max));
    await this.reloadAfter(() => this.applyPrice.click());
  }

  async sortBy(option: SortOption) {
    await this.reloadAfter(() => this.sortSelect.selectOption(option));
  }

  async toggleInStockOnly() {
    await this.reloadAfter(() => this.inStockOnly.click());
  }

  async goToPage(n: number) {
    await this.reloadAfter(() => this.pageButton(n).click());
  }

  async next() {
    await this.reloadAfter(() => this.nextPage.click());
  }

  async previous() {
    await this.reloadAfter(() => this.prevPage.click());
  }

  async addToCart(name: string) {
    await this.card(name).getByTestId('add-to-cart').click();
  }

  async expectCount(n: number) {
    await expect(this.resultsCount).toHaveText(`${n} product${n === 1 ? '' : 's'}`);
  }
}
