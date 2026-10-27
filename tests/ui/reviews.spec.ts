import { test, expect } from '../../src/fixtures';
import { CARDS, VALID_ADDRESS, futureExpiry } from '../../src/data/testData';

test.describe('Product reviews', () => {
  test('a customer who has not bought the product cannot review it', async ({ signedInUser, productPage, tempProduct }) => {
    void signedInUser;
    const p = await tempProduct();
    await productPage.goto(p.slug);
    await expect(productPage.noReviews).toBeVisible();
    await productPage.writeReview(5, 'Looks great!');
    await expect(productPage.reviewError).toHaveText('Only customers who purchased this product can review it');
    await expect(productPage.reviews).toHaveCount(0);
  });

  test('a verified buyer can review once @smoke', async ({ signedInUser, productPage, tempProduct }) => {
    const p = await tempProduct();
    await signedInUser.api.addToCart(p._id, 1);
    await signedInUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'card', card: { number: CARDS.success, expiry: futureExpiry(), cvc: '123' } });

    await productPage.goto(p.slug);
    await productPage.writeReview(4, 'Solid product, fast delivery.');
    await expect(productPage.toast('success', 'Thanks for your review!')).toBeVisible();
    await expect(productPage.reviews).toHaveCount(1);
    await expect(productPage.reviews.getByTestId('review-author')).toHaveText(signedInUser.name);
    await expect(productPage.reviews.getByTestId('review-comment')).toHaveText('Solid product, fast delivery.');
    await expect(productPage.reviewCount).toHaveText('(1 reviews)');
    await expect(productPage.noReviews).toBeHidden();
    await expect(productPage.reviewComment).toHaveValue('');

    // second review is rejected
    await productPage.writeReview(1, 'Changed my mind');
    await expect(productPage.reviewError).toHaveText('You have already reviewed this product');
    await expect(productPage.reviews).toHaveCount(1);
  });
});
