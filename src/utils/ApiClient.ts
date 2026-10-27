import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { env } from '../config/env';
import type { Address } from '../data/testData';

export interface ApiUser {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  address: Address | null;
}

export interface ApiProduct {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  category: string;
  brand: string;
  image: string;
  stock: number;
  rating: number;
  numReviews: number;
  featured: boolean;
  reviews?: { _id: string; name: string; rating: number; comment: string }[];
}

export interface ApiCart {
  items: { product: string; name: string; price: number; stock: number; quantity: number; lineTotal: number }[];
  coupon: { code: string; type: 'percent' | 'fixed'; value: number } | null;
  couponError: string | null;
  itemCount: number;
  itemsPrice: number;
  discount: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
}

export interface ApiOrder {
  _id: string;
  orderNumber: string;
  items: { product: string; name: string; price: number; quantity: number }[];
  shippingAddress: Address;
  paymentMethod: 'card' | 'cod';
  itemsPrice: number;
  discount: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
  coupon: string | null;
  isPaid: boolean;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
}

export interface PlaceOrderBody {
  shippingAddress?: Partial<Address>;
  paymentMethod?: string;
  card?: { number: string; expiry: string; cvc: string };
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Thin typed wrapper over Playwright's APIRequestContext for the ShopVerse REST API.
 * Raw methods (`get/post/put/delete`) return the APIResponse so tests can assert status codes;
 * the helpers below them assert success and return parsed bodies for test setup.
 */
export class ApiClient {
  constructor(
    readonly request: APIRequestContext,
    readonly token?: string
  ) {}

  /** Same request context, authenticated as someone else. */
  as(token?: string) {
    return new ApiClient(this.request, token);
  }

  url(path: string) {
    return `${env.apiURL}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async send(method: Method, path: string, data?: unknown, headers: Record<string, string> = {}): Promise<APIResponse> {
    const allHeaders: Record<string, string> = { ...headers };
    if (this.token && !('Authorization' in allHeaders)) allHeaders.Authorization = `Bearer ${this.token}`;
    return this.request.fetch(this.url(path), { method, data, headers: allHeaders, failOnStatusCode: false });
  }

  get = (path: string, headers?: Record<string, string>) => this.send('GET', path, undefined, headers);
  post = (path: string, data?: unknown) => this.send('POST', path, data);
  put = (path: string, data?: unknown) => this.send('PUT', path, data);
  delete = (path: string) => this.send('DELETE', path);

  /** Assert a 2xx response and return its JSON body. */
  static async ok<T>(res: APIResponse, what: string): Promise<T> {
    if (!res.ok()) {
      throw new Error(`${what} failed: ${res.status()} ${res.statusText()} - ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  // ---------- auth ----------
  async login(email: string, password: string): Promise<{ token: string; user: ApiUser }> {
    return ApiClient.ok(await this.post('/auth/login', { email, password }), `Login as ${email}`);
  }

  async register(name: string, email: string, password: string): Promise<{ token: string; user: ApiUser }> {
    return ApiClient.ok(await this.post('/auth/register', { name, email, password }), `Register ${email}`);
  }

  async updateProfile(body: { name?: string; address?: Address; password?: string }) {
    return ApiClient.ok<{ user: ApiUser }>(await this.put('/auth/profile', body), 'Update profile');
  }

  // ---------- catalog ----------
  async product(slugOrId: string): Promise<ApiProduct> {
    const body = await ApiClient.ok<{ product: ApiProduct }>(await this.get(`/products/${slugOrId}`), `Get product ${slugOrId}`);
    return body.product;
  }

  async products(query: Record<string, string | number | boolean> = {}) {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    return ApiClient.ok<{ products: ApiProduct[]; page: number; pages: number; total: number }>(
      await this.get(`/products${qs ? `?${qs}` : ''}`),
      'List products'
    );
  }

  // ---------- cart ----------
  async cart(): Promise<ApiCart> {
    return (await ApiClient.ok<{ cart: ApiCart }>(await this.get('/cart'), 'Get cart')).cart;
  }

  async addToCart(productId: string, quantity = 1): Promise<ApiCart> {
    return (await ApiClient.ok<{ cart: ApiCart }>(await this.post('/cart/items', { productId, quantity }), 'Add to cart')).cart;
  }

  /** Convenience: add by slug. */
  async addSlugToCart(slug: string, quantity = 1): Promise<ApiCart> {
    const p = await this.product(slug);
    return this.addToCart(p._id, quantity);
  }

  async clearCart(): Promise<ApiCart> {
    return (await ApiClient.ok<{ cart: ApiCart }>(await this.delete('/cart'), 'Clear cart')).cart;
  }

  async applyCoupon(code: string): Promise<ApiCart> {
    return (await ApiClient.ok<{ cart: ApiCart }>(await this.post('/cart/coupon', { code }), `Apply coupon ${code}`)).cart;
  }

  // ---------- orders ----------
  async placeOrder(body: PlaceOrderBody): Promise<ApiOrder> {
    return (await ApiClient.ok<{ order: ApiOrder }>(await this.post('/orders', body), 'Place order')).order;
  }

  async myOrders(): Promise<ApiOrder[]> {
    return (await ApiClient.ok<{ orders: ApiOrder[] }>(await this.get('/orders/mine'), 'My orders')).orders;
  }

  // ---------- admin ----------
  async adminCreateProduct(body: Record<string, unknown>): Promise<ApiProduct> {
    const res = await this.post('/admin/products', body);
    expect(res.status(), 'admin create product').toBe(201);
    return ((await res.json()) as { product: ApiProduct }).product;
  }

  async adminUpdateProduct(id: string, body: Record<string, unknown>): Promise<ApiProduct> {
    return (await ApiClient.ok<{ product: ApiProduct }>(await this.put(`/admin/products/${id}`, body), 'Admin update product')).product;
  }

  async adminDeleteProduct(id: string) {
    // 404 is fine during cleanup (a test may have deleted it already)
    const res = await this.delete(`/admin/products/${id}`);
    if (![200, 404].includes(res.status())) throw new Error(`Delete product ${id}: ${res.status()}`);
  }

  async adminSetOrderStatus(id: string, status: ApiOrder['status']): Promise<ApiOrder> {
    return (await ApiClient.ok<{ order: ApiOrder }>(await this.put(`/admin/orders/${id}/status`, { status }), 'Set order status')).order;
  }

  // ---------- test helpers (ENABLE_TEST_ROUTES=true) ----------
  async resetDatabase() {
    return ApiClient.ok<{ users: number; products: number; coupons: number }>(await this.post('/test/reset'), 'Reset database');
  }

  async deleteUser(email: string) {
    return this.delete(`/test/users/${encodeURIComponent(email)}`);
  }

  async setStock(slug: string, stock: number) {
    return ApiClient.ok<{ product: ApiProduct }>(await this.put(`/test/products/${slug}/stock`, { stock }), `Set stock ${slug}`);
  }

  async health() {
    return this.get('/health');
  }
}
