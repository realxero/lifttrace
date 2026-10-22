// Fork: the core flow, end to end. If any of these break, nothing else matters.
import { test, expect } from '@playwright/test';
import { watchErrors, today, open } from './helpers.js';

test('log a set, finish the workout, and it is saved', async ({ page, request }) => {
  const noErrors = watchErrors(page);
  await open(page, 'diary');
  await expect(page.getByText('Ready to train?')).toBeVisible();

  await page.getByRole('button', { name: /Add Exercise/ }).click();
  await page.getByRole('button', { name: /Bench Press/ }).first().click();
  await page.getByRole('button', { name: 'Close' }).last().click();

  const inputs = page.locator('input.set-input');
  await expect(inputs).toHaveCount(2);
  await inputs.nth(0).fill('135');
  await inputs.nth(1).fill('8');
  await page.getByRole('button', { name: 'Mark complete' }).first().click();

  // Finishing every set opens the summary with what was lifted.
  await expect(page.getByText('Workout Complete!')).toBeVisible();
  await expect(page.getByText('135×8')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // The server has it.
  await expect.poll(async () => {
    const r = await request.get(`/api/workout/${await today(page)}`);
    return JSON.stringify(await r.json());
  }).toContain('135');

  // And it survives a reload.
  await page.reload();
  await expect(page.getByText('Bench Press').first()).toBeVisible();
  await expect(page.getByText('Ready to train?')).toHaveCount(0);
  noErrors();
});

test('programs list the starter templates', async ({ page }) => {
  const noErrors = watchErrors(page);
  await open(page, 'programs');
  for (const name of ['Push / Pull / Legs', 'Upper / Lower', 'Full Body 3x']) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
  noErrors();
});

test('statistics open on the overview', async ({ page }) => {
  const noErrors = watchErrors(page);
  await open(page, 'statistics');
  await expect(page.getByText('Overview').first()).toBeVisible();
  await expect(page.getByText(/streak/i).first()).toBeVisible();
  noErrors();
});

test('exercise search narrows the list', async ({ page }) => {
  const noErrors = watchErrors(page);
  await open(page, 'exercises');
  await expect(page.getByText('Back Squat').first()).toBeVisible();
  await page.getByPlaceholder(/search/i).first().fill('squat');
  await expect(page.getByText('Back Squat').first()).toBeVisible();
  await expect(page.getByText('Barbell Row')).toHaveCount(0);
  noErrors();
});

test('settings open, and About shows the fork version', async ({ page }) => {
  const noErrors = watchErrors(page);
  await open(page, 'settings');
  await expect(page.getByRole('button', { name: /My Profile/ })).toBeVisible();
  await page.getByRole('button', { name: /About/ }).last().click();
  await expect(page.getByText(/v\d+\.\d+\.\d+\+fork\.\d+/).first()).toBeVisible();
  noErrors();
});

for (const route of ['diary', 'exercises', 'programs', 'statistics', 'settings']) {
  test(`${route} fits an iPhone screen (no sideways scroll)`, async ({ page }) => {
    await open(page, route);
    await page.waitForTimeout(500);
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll).toBeLessThanOrEqual(width + 1);
  });
}
