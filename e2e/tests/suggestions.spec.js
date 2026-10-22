// Fork patch 3: the suggestion engine, end to end.
import { test, expect } from '@playwright/test';
import { watchErrors, open } from './helpers.js';

async function openDaysBack(page, n) {
  await open(page, 'diary');
  for (let i = 0; i < n; i++) await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByText('Ready to train?')).toBeVisible();
}
async function addExercise(page, name) {
  await page.getByRole('button', { name: /Add Exercise/ }).click();
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByRole('button', { name: 'Close' }).last().click();
}
const card = (page, name) => page.locator('.exercise-card, [class*="ex-card"], .card').filter({ hasText: name }).first();

test('protect an area in settings; the card flags it and swaps avoid it', async ({ page, request }) => {
  const noErrors = watchErrors(page);
  await open(page, 'settings');
  await page.getByRole('button', { name: 'fitness_center Workout expand_more' }).click();
  const box = page.getByTestId('suggestion-settings');
  await box.getByRole('button', { name: 'shoulder', exact: true }).click();
  await expect(box.getByRole('button', { name: 'shoulder', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // The strictness control must be its full height (a settings-row flex rule once squashed it to 2px).
  expect((await box.getByRole('radiogroup').boundingBox()).height).toBeGreaterThan(30);
  await expect.poll(async () => JSON.stringify(await (await request.get('/api/settings')).json()))
    .toContain('"protect":["shoulder"]');

  await openDaysBack(page, 3);
  await addExercise(page, 'Overhead Press');
  const ohp = card(page, 'Overhead Press');
  await expect(ohp.locator('[data-kind="protect"]')).toContainText('Easy on your shoulder');

  await ohp.getByRole('button', { name: 'See swaps' }).click();
  const sheet = page.getByTestId('swap-sheet');
  await expect(sheet).toContainText('Cable Face Pull');
  await expect(sheet).toContainText('Easier on your shoulder');

  // Never suggest one of them: it leaves the list and shows in Settings.
  const fly = sheet.locator('.swap-row').filter({ hasText: 'Machine Rear Delt Fly' });
  await fly.getByRole('button', { name: 'Never suggest' }).click();
  await expect(sheet.locator('.swap-row').filter({ hasText: 'Machine Rear Delt Fly' })).toHaveCount(0);

  // Use the face pull: the card changes identity.
  await sheet.locator('.swap-row').filter({ hasText: 'Cable Face Pull' }).getByRole('button', { name: 'Use' }).click();
  await expect(page.getByText('Cable Face Pull').first()).toBeVisible();
  await expect(page.locator('[data-kind="protect"]')).toHaveCount(0);

  await open(page, 'settings');
  await page.getByRole('button', { name: 'fitness_center Workout expand_more' }).click();
  await expect(page.getByTestId('suggestion-settings')).toContainText('Machine Rear Delt Fly');
  noErrors();
});

test('Suggest a swap works from the menu even with suggestions off', async ({ page }) => {
  const noErrors = watchErrors(page);
  await open(page, 'settings');
  await page.getByRole('button', { name: 'fitness_center Workout expand_more' }).click();
  const box = page.getByTestId('suggestion-settings');
  await box.locator('.setting-row').first().locator('input, button, [role="switch"]').first().click();
  await expect(box.getByRole('radiogroup')).toHaveCount(0);

  await openDaysBack(page, 5);
  await addExercise(page, 'Overhead Press');
  const ohp = card(page, 'Overhead Press');
  await expect(ohp.locator('[data-kind="protect"]')).toHaveCount(0);
  await ohp.getByTitle('More options').click();
  await page.getByRole('button', { name: 'Suggest a swap' }).click();
  await expect(page.getByTestId('swap-sheet')).toContainText('Cable Face Pull');
  noErrors();
});

test('this week: a muscle group with no work gets a one-tap suggestion', async ({ page, request }) => {
  const noErrors = watchErrors(page);
  const r = await request.put('/api/settings', { data: { key: 'suggestionPrefs', value: { enabled: true, strictness: 'balanced', protect: [], never: [], equipment: [] } } });
  expect(r.ok()).toBeTruthy();
  const list = await (await request.get('/api/exercises')).json();
  const byName = (n) => list.find((e) => e.name === n);
  const day = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  // Two chest + quad days this week, no back work at all.
  for (const n of [6, 8]) {
    const exs = ['Bench Press', 'Back Squat'].map((name, i) => ({
      uuid: `gap-${n}-${i}`, exercise_id: byName(name).id, exercise_name: name,
      sets: [{ uuid: `gap-${n}-${i}-0`, weight: 100, reps: 5, completed: true }],
    }));
    const w = await request.put(`/api/workout/${day(n)}`, { data: { name: 'Seeded', exercises: exs } });
    expect(w.ok(), await w.text()).toBeTruthy();
  }

  await open(page, 'diary');
  const gap = page.getByTestId('gap-card');
  await expect(gap).toContainText('No back work in the last 7 days');
  await gap.getByRole('button', { name: /Add Barbell Row/ }).click();
  await expect(page.locator('.exercise-card, [class*="ex-card"], .card').filter({ hasText: 'Barbell Row' }).first()).toBeVisible();
  await expect(gap.getByRole('button', { name: /Add Barbell Row/ })).toHaveCount(0);

  await gap.getByRole('button', { name: 'Not today' }).click();
  await expect(page.getByTestId('gap-card')).toHaveCount(0);
  noErrors();
});
