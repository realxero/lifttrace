// Creates the test account and the exercises the tests use.
import { test as setup, expect } from '@playwright/test';

setup('create account + exercises', async ({ request }) => {
  const reg = await request.post('/api/auth/register', {
    data: { username: 'tester', password: 'Correct-Horse-Battery-9' },
  });
  expect(reg.ok(), await reg.text()).toBeTruthy();

  for (const [name, muscle, equipment] of [
    ['Bench Press', 'chest', 'barbell'], ['Back Squat', 'quadriceps', 'barbell'], ['Barbell Row', 'lats', 'barbell'],
    // Fork patch 3: a shoulder press and two shoulder alternatives for the swap tests.
    ['Overhead Press', 'shoulders', 'barbell'], ['Cable Face Pull', 'shoulders', 'cable'], ['Machine Rear Delt Fly', 'shoulders', 'machine'],
  ]) {
    const r = await request.post('/api/exercises', {
      data: { name, category: 'Strength', primary_muscles: [muscle], equipment: [equipment] },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
  }
  const s = await request.put('/api/settings', { data: { key: 'setupComplete', value: true } });
  expect(s.ok(), await s.text()).toBeTruthy();

  await request.storageState({ path: '.auth/state.json' });
});
