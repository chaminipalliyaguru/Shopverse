/**
 * Deterministic data that mirrors server/src/seedData.js.
 * If the seed changes, update this file - tests derive their expectations from it.
 */

export interface Credentials {
  name: string;
  email: string;
  password: string;
}

export const USERS = {
  admin: { name: 'Admin User', email: 'admin@shopverse.test', password: 'Admin@123' },
  customer: { name: 'John Customer', email: 'customer@shopverse.test', password: 'Customer@123' },
  jane: { name: 'Jane Buyer', email: 'jane@shopverse.test', password: 'Jane@1234' },
} satisfies Record<string, Credentials>;

export type Category = 'Electronics' | 'Clothing' | 'Home' | 'Books' | 'Sports' | 'Accessories';

export const CATEGORIES: Category[] = ['Accessories', 'Books', 'Clothing', 'Electronics', 'Home', 'Sports'];

export interface SeedProduct {
  name: string;
  slug: string;
  category: Category;
  brand: string;
  price: number;
  stock: number;
  rating: number;
  featured: boolean;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// [name, category, brand, price, stock, rating, featured]
const rows: [string, Category, string, number, number, number, boolean][] = [
  ['Wireless Noise-Cancelling Headphones', 'Electronics', 'SoundMax', 129.99, 25, 4.5, true],
  ['Smart Watch Series 5', 'Electronics', 'TimeTech', 199.0, 15, 4.2, true],
  ['4K Action Camera', 'Electronics', 'ShotPro', 89.5, 30, 4.0, false],
  ['Portable Bluetooth Speaker', 'Electronics', 'SoundMax', 45.0, 60, 4.3, true],
  ['USB-C Fast Charger 65W', 'Electronics', 'VoltEdge', 24.99, 100, 4.6, false],
  ['Mechanical Gaming Keyboard', 'Electronics', 'KeyForge', 74.99, 0, 4.4, false],
  ["Men's Classic Denim Jacket", 'Clothing', 'UrbanThread', 59.99, 40, 4.1, false],
  ["Women's Running Shoes", 'Clothing', 'StrideX', 79.0, 35, 4.5, true],
  ['Cotton Crew-Neck T-Shirt (3-pack)', 'Clothing', 'BasicsCo', 29.99, 200, 4.2, false],
  ['Waterproof Hiking Jacket', 'Clothing', 'TrailPeak', 149.0, 12, 4.7, false],
  ['Wool Winter Scarf', 'Clothing', 'UrbanThread', 19.5, 80, 3.9, false],
  ['Stainless Steel Water Bottle 1L', 'Home', 'HydroLife', 22.0, 150, 4.8, true],
  ['Non-Stick Cookware Set (10-piece)', 'Home', 'ChefMate', 119.99, 18, 4.3, false],
  ['Memory Foam Pillow', 'Home', 'DreamWell', 34.99, 70, 4.4, false],
  ['LED Desk Lamp with Wireless Charger', 'Home', 'BrightDesk', 39.99, 45, 4.1, false],
  ['Robot Vacuum Cleaner', 'Home', 'CleanBot', 249.0, 8, 4.0, true],
  ['The Pragmatic Programmer', 'Books', 'Addison-Wesley', 39.95, 50, 4.8, false],
  ['Clean Code', 'Books', 'Prentice Hall', 34.5, 40, 4.5, false],
  ['Atomic Habits', 'Books', 'Avery', 16.99, 120, 4.9, true],
  ['Test Automation with Playwright', 'Books', 'QA Press', 44.0, 25, 4.6, true],
  ['Yoga Mat Premium 6mm', 'Sports', 'ZenFit', 27.99, 90, 4.5, false],
  ['Adjustable Dumbbell Set 20kg', 'Sports', 'IronCore', 139.0, 10, 4.6, false],
  ['Mountain Bike Helmet', 'Sports', 'SafeRide', 54.99, 22, 4.3, false],
  ['Premium Leather Wallet', 'Accessories', 'CraftLeather', 49.0, 55, 4.4, false],
];

export const SEED_PRODUCTS: SeedProduct[] = rows.map(([name, category, brand, price, stock, rating, featured]) => ({
  name,
  slug: slugify(name),
  category,
  brand,
  price,
  stock,
  rating,
  featured,
}));

const bySlug = (slug: string) => {
  const p = SEED_PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`Seed product "${slug}" not found - is testData.ts in sync with seedData.js?`);
  return p;
};

/**
 * Named seed products used by the tests.
 *
 * Tests only READ these or add them to a cart. Anything that mutates stock / rating in a way
 * other tests could observe uses a temporary product created through the `tempProduct` fixture.
 */
export const PRODUCTS = {
  headphones: bySlug('wireless-noise-cancelling-headphones'),
  speaker: bySlug('portable-bluetooth-speaker'),
  keyboardOutOfStock: bySlug('mechanical-gaming-keyboard'),
  tshirt: bySlug('cotton-crew-neck-t-shirt-3-pack'),
  scarf: bySlug('wool-winter-scarf'),
  waterBottle: bySlug('stainless-steel-water-bottle-1l'),
  robotVacuum: bySlug('robot-vacuum-cleaner'),
  atomicHabits: bySlug('atomic-habits'),
  cleanCode: bySlug('clean-code'),
  playwrightBook: bySlug('test-automation-with-playwright'),
  yogaMat: bySlug('yoga-mat-premium-6mm'),
  smartWatch: bySlug('smart-watch-series-5'),
};

export const PAGE_SIZE = 8;
export const MAX_QTY_PER_ITEM = 10;

export interface CouponDef {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrder: number;
}

export const COUPONS = {
  save10: { code: 'SAVE10', type: 'percent', value: 10, minOrder: 0 },
  welcome20: { code: 'WELCOME20', type: 'percent', value: 20, minOrder: 50 },
  flat15: { code: 'FLAT15', type: 'fixed', value: 15, minOrder: 30 },
} satisfies Record<string, CouponDef>;

export const INVALID_COUPONS = {
  expired: { code: 'EXPIRED50', message: 'Coupon has expired' },
  disabled: { code: 'DISABLED', message: 'Invalid coupon code' },
  unknown: { code: 'NOPE-123', message: 'Invalid coupon code' },
};

/** Mock payment gateway cards (server/src/routes/orders.js). */
export const CARDS = {
  success: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
  insufficientFunds: '4000 0000 0000 9995',
  unknown: '1234 5678 9012 3456',
};

export const CARD_MESSAGES = {
  declined: 'Your card was declined',
  insufficientFunds: 'Insufficient funds',
  invalid: 'Invalid card number',
  expired: 'Card has expired',
};

/** A valid MM/YY a few years in the future, so tests never expire. */
export const futureExpiry = () => `12/${String((new Date().getFullYear() + 3) % 100).padStart(2, '0')}`;

export interface Address {
  fullName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
}

export const VALID_ADDRESS: Address = {
  fullName: 'Test Buyer',
  street: '42 Galle Road',
  city: 'Colombo',
  postalCode: '00300',
  country: 'Sri Lanka',
  phone: '+94 77 123 4567',
};

export const ADDRESS_LABELS: Record<keyof Address, string> = {
  fullName: 'Full name',
  street: 'Street address',
  city: 'City',
  postalCode: 'Postal code',
  country: 'Country',
  phone: 'Phone',
};
