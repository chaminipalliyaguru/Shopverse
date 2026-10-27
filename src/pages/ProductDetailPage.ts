import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class ProductDetailPage extends BasePage {
  readonly root: Locator;
  readonly notFound: Locator;
  readonly name: Locator;
  readonly brand: Locator;
  readonly category: Locator;
  readonly price: Locator;
  readonly description: Locator;
  readonly stockStatus: Locator;
  readonly reviewCount: Locator;
  readonly quantity: Locator;
  readonly addToCartButton: Locator;
  readonly reviews: Locator;
  readonly noReviews: Locator;
  readonly reviewForm: Locator;
  readonly reviewRating: Locator;
  readonly reviewComment: Locator;
  readonly submitReview: Locator;
  readonly reviewError: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('product-detail');
    this.notFound = page.getByTestId('product-not-found');
    this.name = page.getByTestId('detail-name');
    this.brand = page.getByTestId('detail-brand');
    this.category = page.getByTestId('detail-category');
    this.price = page.getByTestId('detail-price');
    this.description = page.getByTestId('detail-description');
    this.stockStatus = page.getByTestId('stock-status');
    this.reviewCount = page.getByTestId('review-count');
    this.quantity = page.getByTestId('quantity-select');
    this.addToCartButton = this.root.getByTestId('add-to-cart');
    this.reviews = page.getByTestId('review');
    this.noReviews = page.getByTestId('no-reviews');
    this.reviewForm = page.getByTestId('review-form');
    this.reviewRating = page.getByTestId('review-rating');
    this.reviewComment = page.getByTestId('review-comment-input');
    this.submitReview = page.getByTestId('submit-review');
    this.reviewError = page.getByTestId('review-error');
  }

  async goto(slug: string) {
    await this.page.goto(`/products/${slug}`);
    await this.waitUntilLoaded();
  }

  async addToCart(quantity = 1) {
    if (quantity !== 1) await this.quantity.selectOption(String(quantity));
    await this.addToCartButton.click();
  }

  async writeReview(rating: number, comment: string) {
    await this.reviewRating.selectOption(String(rating));
    await this.reviewComment.fill(comment);
    await this.submitReview.click();
  }
}
