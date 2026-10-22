// Fork patch 5: engagement, end to end. Works on an old day so other tests
// still find today empty. (The monthly recap only shows in the first week of
// a month, so its rules are covered by scripts/engagement.test.js.)
import { test, expect } from '@playwright/test';
import { watchErrors, open } from './helpers.js';

test('finishing a workout celebrates with a real-world comparison', async ({ page }) => {
  const noErrors = watchErrors(page);
  await open(page, 'diary');
  for (let i = 0; i < 45; i++) await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByText('Ready to train?')).toBeVisible();
  await page.getByRole('button', { name: /Add Exercise/ }).click();
  await page.getByRole('button', { name: /Back Squat/ }).first().click();
  await page.getByRole('button', { name: 'Close' }).last().click();
  const inputs = page.locator('input.set-input');
  await inputs.nth(0).fill('225');
  await inputs.nth(1).fill('5');
  await page.getByRole('button', { name: 'Mark complete' }).first().click();
  await expect(page.getByText('Workout Complete!')).toBeVisible();
  // 225 × 5 = 1,125 lb ≈ 1.1 grand pianos.
  await expect(page.getByTestId('ws-like')).toHaveText("That's about 1.1 grand pianos lifted today.");
  await page.getByRole('button', { name: 'Done' }).click();
  noErrors();
});

test('statistics show weekly streak and milestones; Celebrations off hides them', async ({ page, request }) => {
  const noErrors = watchErrors(page);
  await open(page, 'statistics');
  const ms = page.getByTestId('milestones-card');
  await expect(ms).toContainText('Milestones');
  await expect(ms).toContainText('1st workout');
  await expect(ms).toContainText(/Current: \d+ weeks?/);
  await expect(page.getByText('weeks in a row').first()).toBeVisible();

  const r = await request.put('/api/settings', { data: { key: 'celebrations', value: false } });
  expect(r.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText('Overview').first()).toBeVisible();
  await expect(page.getByTestId('milestones-card')).toHaveCount(0);
  await expect(page.getByText('Day Streak').first()).toBeVisible();
  await request.put('/api/settings', { data: { key: 'celebrations', value: true } });
  noErrors();
});
