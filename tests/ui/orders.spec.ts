import { test, expect } from '../../src/fixtures';
import { CARDS, VALID_ADDRESS, futureExpiry } from '../../src/data/testData';
import { money } from '../../src/utils/pricing';
import type { TestUser } from '../../src/fixtures';

const placeCardOrder = (user: TestUser) =>
  user.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'card', card: { number: CARDS.success, expiry: futureExpiry(), cvc: '123' } });

test.describe('Order history', () => {
  test('no orders yet', async ({ signedInUser, ordersPage }) => {
    void signedInUser;
    await ordersPage.goto();
    await expect(ordersPage.noOrders).toContainText('You have not placed any orders yet.');
  });

  test('lists orders newest first and opens the detail page @smoke', async ({ page, signedInUser, ordersPage, orderPage, tempProduct }) => {
    const p = await tempProduct({ price: 12 });
    await signedInUser.api.addToCart(p._id, 1);
    const first = await signedInUser.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });
    await signedInUser.api.addToCart(p._id, 2);
    const second = await placeCardOrder(signedInUser);

    await ordersPage.goto();
    await expect(ordersPage.rows).toHaveCount(2);
    await expect(ordersPage.rows.getByTestId('order-number')).toHaveText([second.orderNumber, first.orderNumber]);
    await expect(ordersPage.row(second.orderNumber).getByTestId('order-total')).toHaveText(money(second.totalPrice));
    await expect(ordersPage.row(second.orderNumber).getByTestId('order-status')).toHaveText('paid');
    await expect(ordersPage.row(first.orderNumber).getByTestId('order-status')).toHaveText('pending');

    await ordersPage.open(first.orderNumber);
    await expect(page).toHaveURL(`/orders/${first._id}`);
    await expect(orderPage.orderNumber).toHaveText(first.orderNumber);
    // the "thank you" banner is only shown right after checkout
    await expect(orderPage.successBanner).toBeHidden();
  });

  test('cancelling an order restores stock', async ({ signedInUser, orderPage, tempProduct, db }) => {
    const p = await tempProduct({ stock: 5 });
    await signedInUser.api.addToCart(p._id, 2);
    const order = await placeCardOrder(signedInUser);
    expect(await db.productStock(p.slug)).toBe(3);

    await orderPage.goto(order._id);
    await orderPage.cancelButton.click();
    await expect(orderPage.toast('success', 'Order cancelled')).toBeVisible();
    await expect(orderPage.status).toHaveText('cancelled');
    await expect(orderPage.cancelButton).toBeHidden();
    expect(await db.productStock(p.slug)).toBe(5);
  });

  for (const status of ['shipped', 'delivered'] as const) {
    test(`a ${status} order cannot be cancelled`, async ({ signedInUser, adminApi, orderPage, tempProduct }) => {
      const p = await tempProduct();
      await signedInUser.api.addToCart(p._id, 1);
      const order = await placeCardOrder(signedInUser);
      await adminApi.adminSetOrderStatus(order._id, status);

      await orderPage.goto(order._id);
      await expect(orderPage.status).toHaveText(status);
      await expect(orderPage.cancelButton).toHaveCount(0);
    });
  }

  test("another customer's order is not visible", async ({ createUser, signedInUser, orderPage, tempProduct }) => {
    void signedInUser;
    const owner = await createUser();
    const p = await tempProduct();
    await owner.api.addToCart(p._id, 1);
    const order = await owner.api.placeOrder({ shippingAddress: VALID_ADDRESS, paymentMethod: 'cod' });

    await orderPage.goto(order._id);
    await expect(orderPage.error).toContainText('You can only view your own orders');
    await expect(orderPage.root).toHaveCount(0);
  });

  test('a non-existent order shows an error', async ({ signedInUser, orderPage }) => {
    void signedInUser;
    await orderPage.goto('0123456789abcdef01234567');
    await expect(orderPage.error).toContainText('Order not found');
  });
});
