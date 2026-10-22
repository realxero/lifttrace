// Shared bits for the e2e tests.
import { expect } from '@playwright/test';

/** Collect uncaught page errors; call the returned function to assert none. */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return () => expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
}

/** Today's date as the app stores it (the browser's local day). */
export async function today(page) {
  return page.evaluate(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
}

/** Open a route and wait for the bottom navigation to be there. */
export async function open(page, route) {
  await page.goto(`/#/${route}`);
  await expect(page.getByRole('button', { name: 'Diary', exact: true })).toBeVisible();
}
