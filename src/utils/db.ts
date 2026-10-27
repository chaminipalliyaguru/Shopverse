import { Db, MongoClient, ObjectId } from 'mongodb';
import { env } from '../config/env';

/**
 * Direct MongoDB access for assertions the UI/API can't show
 * (password hashing, persisted totals, stock levels). Read-only by design:
 * all writes go through the app or its /api/test helpers.
 */
export class ShopDb {
  private constructor(
    private readonly client: MongoClient,
    readonly db: Db
  ) {}

  static async connect(uri = env.mongoUri): Promise<ShopDb> {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
    try {
      await client.connect();
    } catch (err) {
      throw new Error(
        `Could not connect to MongoDB at ${uri}. Is mongod running? Set MONGO_URI in e2e/.env if it lives elsewhere.\n${(err as Error).message}`
      );
    }
    return new ShopDb(client, client.db()); // db name comes from the URI path (/shopverse)
  }

  async close() {
    await this.client.close();
  }

  findUserByEmail(email: string) {
    return this.db.collection('users').findOne({ email: email.toLowerCase() });
  }

  findProductBySlug(slug: string) {
    return this.db.collection('products').findOne({ slug });
  }

  async productStock(slug: string): Promise<number> {
    const p = await this.findProductBySlug(slug);
    if (!p) throw new Error(`Product ${slug} not found in DB`);
    return p.stock as number;
  }

  findOrderByNumber(orderNumber: string) {
    return this.db.collection('orders').findOne({ orderNumber });
  }

  async cartForEmail(email: string) {
    const user = await this.findUserByEmail(email);
    if (!user) return null;
    return this.db.collection('carts').findOne({ user: user._id as ObjectId });
  }

  countOrdersForEmail = async (email: string) => {
    const user = await this.findUserByEmail(email);
    return user ? this.db.collection('orders').countDocuments({ user: user._id }) : 0;
  };
}
