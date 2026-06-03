import { expect, test } from '@playwright/test';

// The preview server builds with the production base path (/lifegraph).
const home = '/lifegraph';

test('home page shows the lifegraph heading', async ({ page }) => {
	await page.goto(home);
	await expect(
		page.getByRole('heading', { level: 1, name: "Heather Bree's Lifegraph" })
	).toBeVisible();
});

test('timeline renders event entries', async ({ page }) => {
	await page.goto(home);
	await expect(page.locator('section.timeline li.timeline-item').first()).toBeVisible();
});
