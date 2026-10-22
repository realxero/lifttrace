# LiftTrace — personal fork

A fork of [TraceApps/lifttrace](https://github.com/TraceApps/lifttrace)
(AGPL-3.0), the sister app to the NutriTrace fork. Everything upstream ships is
unchanged unless listed here. The running version shows as
**`v1.4.0+fork.N`** in Settings → About and Settings → Updates, with the build
it came from (`ios-12 · a1b2c3d` from GitHub, or `local` from your own server).

Goal: the web app and the iOS app behave the same. Anything that only works on
one is listed with the reason.

## Patches

| # | What |
|---|------|
| 1 | **iPhone app + tests.** Capacitor iOS project, built on GitHub as an unsigned IPA for LiveContainer/SideStore (*LiftTrace iOS IPA* workflow → release *lifttrace-ios*), with a full-bleed icon, dark splash, permission prompts, and background audio so the radio keeps playing with the screen locked. Android-only native parts (ExoPlayer radio, stream proxy, Wear OS pairing, fold sensor, APK updates) are now checked with `isAndroid`, so the iOS app takes the web path instead of calling plugins that don't exist there. Server CORS accepts the iOS app (`capacitor://app.lifttrace.local`). Fork version + build stamp (the watch still gets the plain upstream version). *Fork tests* workflow: unit tests + i18n check, and Playwright e2e smoke tests in WebKit and Chromium on an iPhone-sized screen (log a set → finish → saved and survives reload; programs; statistics; exercise search; settings; no sideways scrolling). Tests: `scripts/fork-ios.test.js`, `e2e/`. |

## Web vs iOS app

| Feature | Web | iOS app | Why different |
|---|---|---|---|
| Radio / music | web audio | web audio (keeps playing when locked) | ExoPlayer is Android-only |
| Voice logging (Smart Add) | Safari speech | not yet | iPhone apps don't get browser speech recognition; needs the native speech plugin NutriTrace uses (planned) |
| Rest-timer alert in background | browser notification | phone notification, default sound | The custom tones are Android sound files |
| Wear OS watch | — | — | Android only |
| Updates | server update check | re-sideload *lifttrace-ios* | iOS apps can't install their own updates |
| Everything else | same | same | — |

## Building

- **Web/server:** `docker build -t lifttrace-fork:latest .` on the server.
- **iOS:** push to GitHub → Actions → *LiftTrace iOS IPA* → Releases → *lifttrace-ios*.
- **Tests:** `npm test` (unit) and `cd e2e && npx playwright test` (see `e2e/README.md`).

Bump `FORK_VERSION` in `src/lib/version.js` and add a row above with each patch.
