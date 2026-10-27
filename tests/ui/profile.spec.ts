import { test, expect } from '../../src/fixtures';
import { VALID_ADDRESS } from '../../src/data/testData';

test.describe('Profile', () => {
  test('shows the account email', async ({ signedInUser, profilePage }) => {
    await profilePage.goto();
    await expect(profilePage.email).toHaveText(signedInUser.email);
    await expect(profilePage.name).toHaveValue(signedInUser.name);
  });

  test('updating name and address persists', async ({ page, signedInUser, profilePage }) => {
    await profilePage.goto();
    await profilePage.name.fill('Kamal Silva');
    await profilePage.fillAddress(VALID_ADDRESS);
    await profilePage.save.click();

    await expect(profilePage.toast('success', 'Profile updated')).toBeVisible();
    await expect(profilePage.navbar.profileLink).toHaveText('Kamal Silva');

    const { user } = await (await signedInUser.api.get('/auth/me')).json();
    expect(user).toMatchObject({ name: 'Kamal Silva', address: VALID_ADDRESS });

    await page.reload();
    await expect(profilePage.addressField('city')).toHaveValue(VALID_ADDRESS.city);
  });

  test('changing the password', async ({ page, signedInUser, profilePage, loginPage }) => {
    await profilePage.goto();
    await profilePage.password.fill('NewSecret@456');
    await profilePage.save.click();
    await expect(profilePage.toast('success', 'Profile updated')).toBeVisible();
    await expect(profilePage.password).toHaveValue('');

    await profilePage.navbar.logoutButton.click();
    await page.goto('/login');
    await loginPage.login(signedInUser.email, signedInUser.password);
    await expect(loginPage.error).toHaveText('Invalid email or password');
    await loginPage.login(signedInUser.email, 'NewSecret@456');
    await loginPage.navbar.expectLoggedInAs(signedInUser.name);
  });

  test('a too-short password is rejected', async ({ signedInUser, profilePage }) => {
    void signedInUser;
    await profilePage.goto();
    await profilePage.password.fill('123');
    await profilePage.save.click();
    await expect(profilePage.error).toHaveText('Password must be at least 6 characters');
  });
});
