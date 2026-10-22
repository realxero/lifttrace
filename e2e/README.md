# End-to-end tests (fork)

Boots the real LiftTrace server on a throwaway database in `/tmp/lt-e2e`
(no exercise downloads, no AI, update checks off), creates a test account and
three exercises, then drives the app on an iPhone 14-sized screen.

```bash
npm run build                 # at the repo root
cd server && npm ci && cd ..
cd e2e
npm install
npx playwright install chromium webkit
mkdir -p .auth
npx playwright test           # Chromium by default
E2E_BROWSER=webkit npx playwright test
```

On GitHub the *Fork tests* workflow runs both browsers on every push and
uploads screenshots and traces when something fails.
