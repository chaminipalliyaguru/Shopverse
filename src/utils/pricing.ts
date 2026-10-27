import type { CouponDef } from '../data/testData';

/**
 * Independent re-implementation of the store's pricing rules, used as a test oracle.
 *   shipping $5.99, free when the DISCOUNTED subtotal >= $100 (and free for an empty cart)
 *   tax 8% on the discounted subtotal
 *   percent coupons: % of items; fixed coupons: capped at the items total
 */
export const SHIPPING_FLAT = 5.99;
export const FREE_SHIPPING_OVER = 100;
export const TAX_RATE = 0.08;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const money = (n: number) => `$${n.toFixed(2)}`;

export interface Line {
  price: number;
  quantity: number;
}

// a type alias (not an interface) so it can be passed straight to expect(...).toMatchObject()
export type Totals = {
  itemsPrice: number;
  discount: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
};

export function expectedTotals(lines: Line[], coupon?: Pick<CouponDef, 'type' | 'value'>): Totals {
  const itemsPrice = round2(lines.reduce((s, l) => s + l.price * l.quantity, 0));
  let discount = 0;
  if (coupon) {
    discount = coupon.type === 'percent' ? round2((itemsPrice * coupon.value) / 100) : Math.min(coupon.value, itemsPrice);
  }
  const discounted = round2(itemsPrice - discount);
  const shippingPrice = itemsPrice === 0 || discounted >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FLAT;
  const taxPrice = round2(discounted * TAX_RATE);
  const totalPrice = round2(discounted + shippingPrice + taxPrice);
  return { itemsPrice, discount, shippingPrice, taxPrice, totalPrice };
}

/** How the UI renders shipping in the summary. */
export const shippingLabel = (t: Totals) => (t.shippingPrice === 0 ? 'FREE' : money(t.shippingPrice));

/** Parse "$1,234.56" / "-$12.00" into a number. */
export const parseMoney = (text: string) => {
  const n = Number(text.replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) throw new Error(`Not a money value: "${text}"`);
  return n;
};
