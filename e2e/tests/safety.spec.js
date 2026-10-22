// Fork patch 2: the safety layer, end to end. Works on earlier days' diaries
// so the smoke tests still find today empty.
import { test, expect } from '@playwright/test';
import { watchErrors, open } from './helpers.js';

const iso = (d) => d.toISOString().slice(0, 10);
function daysAgo(n) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n);
  return iso(d);
}

async function exerciseId(request, name) {
  const list = await (await request.get('/api/exercises')).json();
  const rows = Array.isArray(list) ? list : (list.exercises || list.items || []);
  const hit = rows.find((e) => e.name === name);
  expect(hit, `exercise ${name}`).toBeTruthy();
  return hit.id;
}

async function seedSession(request, date, ex, sets, extra = {}) {
  const body = {
    name: 'Seeded',
    exercises: [{
      uuid: `seed-${date}-${ex.id}`, exercise_id: ex.id, exercise_name: ex.name,
      sets: sets.map((s, i) => ({ uuid: `seed-${date}-${ex.id}-${i}`, completed: true, ...s })),
      ...extra,
    }],
  };
  const r = await request.put(`/api/workout/${date}`, { data: body });
  expect(r.ok(), await r.text()).toBeTruthy();
}

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

test('hard sessions, an earlier pain flag, and a big jump each get a tip', async ({ page, request }) => {
  const noErrors = watchErrors(page);
  const squat = { id: await exerciseId(request, 'Back Squat'), name: 'Back Squat' };
  await seedSession(request, daysAgo(10), squat, [{ weight: 225, reps: 3, rpe: 9 }]);
  await seedSession(request, daysAgo(7), squat, [{ weight: 225, reps: 3, rpe: 9.5 }]);
  await seedSession(request, daysAgo(4), squat, [{ weight: 225, reps: 3, rpe: 10 }], { pain: { at: new Date().toISOString(), note: 'test ache' } });

  await openDaysBack(page, 1);
  await addExercise(page, 'Back Squat');

  const notes = page.getByTestId('safety-notes');
  await expect(notes.locator('[data-kind="pain_last"]')).toContainText('flagged pain here last time');
  await expect(notes.locator('[data-kind="pain_last"]')).toContainText('test ache');
  await expect(notes.locator('[data-kind="deload"]')).toContainText('three sessions in a row');

  // A big jump over last time's 225.
  await page.locator('input.set-input').first().fill('275');
  await page.locator('input.set-input').first().blur();
  await expect(notes.locator('[data-kind="jump"]')).toContainText('225 → 275');

  // "Got it" hides the coaching tips for today; the pain follow-up stays.
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(notes.locator('[data-kind="deload"]')).toHaveCount(0);
  await expect(notes.locator('[data-kind="jump"]')).toHaveCount(0);
  await expect(notes.locator('[data-kind="pain_last"]')).toBeVisible();
  noErrors();
});

test('flagging pain shows on the card, survives a reload, and reaches history', async ({ page, request }) => {
  const noErrors = watchErrors(page);
  await openDaysBack(page, 2);
  await addExercise(page, 'Barbell Row');
  const card = page.locator('.exercise-card, [class*="ex-card"], .card').filter({ hasText: 'Barbell Row' }).first();

  await card.getByTitle('More options').click();
  await page.getByRole('button', { name: 'Flag pain or discomfort' }).click();
  await expect(card.getByText('Pain flagged').first()).toBeVisible();
  await expect(card.locator('[data-kind="pain_today"]')).toContainText('No session is worth an injury');

  const rowId = await exerciseId(request, 'Barbell Row');
  await expect.poll(async () => JSON.stringify(await (await request.get(`/api/workout/history/${rowId}`)).json()))
    .toContain('"pain"');

  await page.reload();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.locator('[data-kind="pain_today"]')).toBeVisible();

  // And it can be cleared.
  const card2 = page.locator('.exercise-card, [class*="ex-card"], .card').filter({ hasText: 'Barbell Row' }).first();
  await card2.getByTitle('More options').click();
  await page.getByRole('button', { name: 'Clear pain flag' }).click();
  await expect(page.locator('[data-kind="pain_today"]')).toHaveCount(0);
  noErrors();
});
