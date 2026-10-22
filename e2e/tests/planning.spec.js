// Fork patch 4: progress planning, end to end. Cleans up today's workout so
// the smoke tests still start from an empty day.
import { test, expect } from '@playwright/test';
import { watchErrors, open, today } from './helpers.js';

const ymd = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const daysAgo = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return ymd(d); };

async function exercises(request) {
  const list = await (await request.get('/api/exercises')).json();
  return (name) => list.find((e) => e.name === name);
}
async function seed(request, date, ex, sets) {
  const r = await request.put(`/api/workout/${date}`, { data: { name: 'Seeded', exercises: [{
    uuid: `plan-${date}-${ex.id}`, exercise_id: ex.id, exercise_name: ex.name,
    sets: sets.map(([weight, reps], i) => ({ uuid: `plan-${date}-${ex.id}-${i}`, weight, reps, completed: true })),
  }] } });
  expect(r.ok(), await r.text()).toBeTruthy();
}

test('pick training days, take the suggested starter, start today’s workout', async ({ page, request }) => {
  const noErrors = watchErrors(page);
  await open(page, 'diary');
  const card = page.getByTestId('week-plan');
  await expect(card).toContainText('pick the days you train');
  await card.getByRole('button', { name: 'Pick days' }).click();

  const sheet = page.getByTestId('week-plan-sheet');
  const wd = new Date().getDay();
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Today plus the two days after it: 3 days a week.
  for (const i of [0, 1, 2]) await sheet.getByRole('button', { name: names[(wd + i) % 7], exact: true }).click();
  await expect(sheet).toContainText('3 days a week, Full Body 3x is a good fit');
  await sheet.getByRole('button', { name: 'Use Full Body 3x' }).click();
  await expect(page.getByText('Full Body 3x is now your active program.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();

  // Seven days, three to train, four rest; today first.
  await expect(card.locator('.plan-day')).toHaveCount(7);
  await expect(card.locator('.plan-day.rest')).toHaveCount(4);
  // Chips show what differs between workouts ("A", "B"), not "Work…".
  await expect(card.locator('.plan-day.today .pd-what')).toHaveText('A');
  const start = card.getByRole('button', { name: /^Start / });
  await expect(start).toBeVisible();
  const label = (await start.innerText()).replace('play_arrow', '').replace('Start', '').trim();
  expect(label).toBe('Workout A');
  await start.click();
  await expect(page.getByText('Ready to train?')).toHaveCount(0);
  await expect(card.getByRole('button', { name: /^Start / })).toHaveCount(0);
  expect(label.length).toBeGreaterThan(0);

  // Clean up for the other tests: let the app's save land first, then delete.
  const day = await today(page);
  const count = async () => ((await (await request.get(`/api/workout/${day}`)).json())?.workout?.exercises || []).length;
  await expect.poll(count).toBeGreaterThan(0);
  await page.goto('about:blank');
  await request.delete(`/api/workout/${day}`);
  await expect.poll(count).toBe(0);
  noErrors();
});

test('weekly check-in shows last week and goes away with Got it', async ({ page, request }) => {
  const noErrors = watchErrors(page);
  const ex = await exercises(request);
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const wd = now.getDay();
  const lastMonday = daysAgo((wd === 0 ? 6 : wd - 1) + 7);
  await seed(request, lastMonday, ex('Machine Rear Delt Fly'), [[50, 12], [50, 12], [50, 12]]);

  await open(page, 'diary');
  const ci = page.getByTestId('checkin-card');
  await expect(ci).toContainText('Weekly check-in');
  await expect(ci).toContainText('workouts');
  await expect(ci.locator('.ci-advice')).not.toBeEmpty();
  await ci.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('checkin-card')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('week-plan')).toBeVisible();
  await expect(page.getByTestId('checkin-card')).toHaveCount(0);
  noErrors();
});

test('a strength goal gets a projected date from the trend', async ({ page, request }) => {
  const noErrors = watchErrors(page);
  const ex = await exercises(request);
  const bench = ex('Bench Press');
  for (const [n, w] of [[36, 185], [29, 190], [22, 195], [15, 200]]) await seed(request, daysAgo(n), bench, [[w, 5]]);

  await page.goto(`/#/exercise/${bench.id}`);
  const goal = page.getByTestId('goal-card');
  await expect(goal).toContainText('Strength goal');
  await expect(goal).toContainText('Now about 233');
  await goal.getByRole('button', { name: 'Set goal' }).click();
  await goal.getByRole('spinbutton').fill('250');
  await goal.getByRole('button', { name: 'Save' }).click();
  await expect(goal).toContainText('Strength goal: 250');
  await expect(goal.locator('[data-status="on_pace"]')).toContainText('On pace for around');
  await expect(goal).toContainText('sustainable pace');

  // A goal already passed says so.
  await goal.getByRole('button', { name: 'Change' }).click();
  await goal.getByRole('spinbutton').fill('200');
  await goal.getByRole('button', { name: 'Save' }).click();
  await expect(goal.locator('[data-status="reached"]')).toContainText("You've reached it");
  noErrors();
});
