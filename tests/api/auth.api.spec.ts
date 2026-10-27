import { test, expect } from '../../src/fixtures';
import { USERS } from '../../src/data/testData';
import { uniqueEmail } from '../../src/utils/random';

test.describe('API · health & auth', () => {
  test('GET /health returns ok @smoke', async ({ api }) => {
    const res = await api.health();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(new Date(body.time).toString()).not.toBe('Invalid Date');
  });

  test('unknown route returns 404 JSON', async ({ api }) => {
    const res = await api.get('/does-not-exist');
    expect(res.status()).toBe(404);
    expect((await res.json()).message).toContain('Route not found');
  });

  test.describe('POST /auth/register', () => {
    test('creates a user, returns a token and never leaks the password', async ({ api, db }) => {
      const email = uniqueEmail('api-reg');
      const res = await api.post('/auth/register', { name: 'API Person', email, password: 'Secret@123' });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.token).toEqual(expect.any(String));
      expect(body.user).toMatchObject({ name: 'API Person', email, role: 'user' });
      expect(body.user).not.toHaveProperty('password');

      // DB: stored hashed (bcrypt), email normalised
      const dbUser = await db.findUserByEmail(email);
      expect(dbUser).not.toBeNull();
      expect(dbUser!.password).not.toBe('Secret@123');
      expect(dbUser!.password).toMatch(/^\$2[aby]\$10\$/);

      await api.deleteUser(email);
    });

    test('lower-cases the email', async ({ api }) => {
      const email = uniqueEmail('MiXeD.CaSe');
      const res = await api.post('/auth/register', { name: 'Case', email, password: 'Secret@123' });
      expect(res.status()).toBe(201);
      expect((await res.json()).user.email).toBe(email.toLowerCase());
      await api.deleteUser(email);
    });

    const invalid = [
      { title: 'missing name', body: { email: 'x@shopverse.test', password: 'Secret@123' }, message: 'Name, email and password are required' },
      { title: 'missing password', body: { name: 'X', email: 'x@shopverse.test' }, message: 'Name, email and password are required' },
      { title: 'invalid email', body: { name: 'X', email: 'not-an-email', password: 'Secret@123' }, message: 'Please enter a valid email address' },
      { title: 'short password', body: { name: 'X', email: 'x@shopverse.test', password: '123' }, message: 'Password must be at least 6 characters' },
    ];
    for (const c of invalid) {
      test(`400 for ${c.title}`, async ({ api }) => {
        const res = await api.post('/auth/register', c.body);
        expect(res.status()).toBe(400);
        expect((await res.json()).message).toBe(c.message);
      });
    }

    test('409 for an existing email (case-insensitive)', async ({ api }) => {
      const res = await api.post('/auth/register', {
        name: 'Dup',
        email: USERS.customer.email.toUpperCase(),
        password: 'Secret@123',
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).message).toBe('An account with this email already exists');
    });
  });

  test.describe('POST /auth/login', () => {
    for (const role of ['admin', 'customer', 'jane'] as const) {
      test(`seeded ${role} can log in`, async ({ api }) => {
        const { token, user } = await api.login(USERS[role].email, USERS[role].password);
        expect(token.split('.')).toHaveLength(3); // JWT
        expect(user.role).toBe(role === 'admin' ? 'admin' : 'user');
      });
    }

    test('401 for wrong password and unknown email (same message)', async ({ api }) => {
      const wrongPw = await api.post('/auth/login', { email: USERS.customer.email, password: 'wrong' });
      const unknown = await api.post('/auth/login', { email: uniqueEmail('ghost'), password: 'whatever' });
      expect(wrongPw.status()).toBe(401);
      expect(unknown.status()).toBe(401);
      // no user enumeration
      expect((await wrongPw.json()).message).toBe('Invalid email or password');
      expect((await unknown.json()).message).toBe('Invalid email or password');
    });

    test('400 when fields are missing', async ({ api }) => {
      const res = await api.post('/auth/login', { email: USERS.customer.email });
      expect(res.status()).toBe(400);
    });
  });

  test.describe('GET /auth/me & PUT /auth/profile', () => {
    test('401 without a token', async ({ api }) => {
      const res = await api.get('/auth/me');
      expect(res.status()).toBe(401);
      expect((await res.json()).message).toBe('Not authorized, no token');
    });

    test('401 with a malformed / tampered token', async ({ api, freshUser }) => {
      const tampered = freshUser.token.slice(0, -2) + (freshUser.token.endsWith('aa') ? 'bb' : 'aa');
      for (const token of ['garbage', tampered]) {
        const res = await api.as(token).get('/auth/me');
        expect(res.status()).toBe(401);
        expect((await res.json()).message).toBe('Not authorized, token invalid or expired');
      }
    });

    test('401 when the user behind a valid token was deleted', async ({ api, createUser }) => {
      const user = await createUser();
      await api.deleteUser(user.email);
      const res = await user.api.get('/auth/me');
      expect(res.status()).toBe(401);
      expect((await res.json()).message).toBe('Not authorized, user not found');
    });

    test('returns the current user', async ({ freshUser }) => {
      const res = await freshUser.api.get('/auth/me');
      expect(res.status()).toBe(200);
      expect((await res.json()).user).toMatchObject({ email: freshUser.email, name: freshUser.name, role: 'user' });
    });

    test('updates name, address and password', async ({ api, freshUser }) => {
      const address = { fullName: 'New Name', street: '1 Main St', city: 'Kandy', postalCode: '20000', country: 'Sri Lanka', phone: '0771234567' };
      const { user } = await freshUser.api.updateProfile({ name: 'New Name', address, password: 'Changed@123' });
      expect(user).toMatchObject({ name: 'New Name', address });

      // old password no longer works, new one does
      expect((await api.post('/auth/login', { email: freshUser.email, password: freshUser.password })).status()).toBe(401);
      expect((await api.post('/auth/login', { email: freshUser.email, password: 'Changed@123' })).status()).toBe(200);
    });

    test('400 for a too-short new password', async ({ freshUser }) => {
      const res = await freshUser.api.put('/auth/profile', { password: '123' });
      expect(res.status()).toBe(400);
    });
  });
});
