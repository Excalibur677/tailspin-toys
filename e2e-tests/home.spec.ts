import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the correct title', async ({ page }) => {
    await expect(page).toHaveTitle('Tailspin Toys - Crowdfunding your new favorite game!');
  });

  test('should display the main heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Welcome to Tailspin Toys', exact: true })).toBeVisible();
  });

  test('should display the site branding in header', async ({ page }) => {
    await expect(page.getByText('Tailspin Toys').first()).toBeVisible();
  });

  test('should display the welcome message', async ({ page }) => {
    await expect(page.getByText('Find your next game! And maybe even back one! Explore our collection!')).toBeVisible();
  });

  test('should filter games by category and publisher', async ({ page }) => {
    await test.step('Apply category and publisher filters', async () => {
      await page.getByRole('checkbox', { name: 'Strategy' }).check();
      await page.getByRole('checkbox', { name: 'CodeForge Studios' }).check();
    });

    await test.step('Verify the filtered catalog shows only matching games', async () => {
      await expect(page.getByRole('link', { name: /DevOps Dominion/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Pipeline Conquest/i })).toBeHidden();
      await expect(page.getByText('No games match the selected filters.')).toBeHidden();
    });
  });

  test('should clear selected filters and restore the full catalog', async ({ page }) => {
    await test.step('Apply a restrictive filter set', async () => {
      await page.getByRole('checkbox', { name: 'Strategy' }).check();
      await page.getByRole('checkbox', { name: 'CodeForge Studios' }).check();
    });

    await test.step('Clear the filters', async () => {
      await page.getByTestId('clear-filters').click();
    });

    await test.step('Confirm the original catalog is visible again', async () => {
      await expect(page.getByRole('link', { name: /DevOps Dominion/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Code Puzzle Chronicles/i })).toBeVisible();
    });
  });
});
