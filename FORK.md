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
| 2 | **Safety layer.** Tips on each exercise card, in an encouraging tone: a *lighter session* suggestion when the last 3 sessions of a lift had a top set at RPE 9+ (needs Track RPE on); a *pain follow-up* when you flagged pain on that lift last time (with your note, and a *Find a variation* link to the exercise's similar exercises / replace); *get it checked* when pain was flagged on 2+ sessions in the last month; and a *big jump* heads-up when a working weight is >10% and ≥15 lb / 7.5 kg over last time's top set. *Flag pain or discomfort* in each exercise's ⋮ menu (shows a red chip on the card, stored on that session, cleared the same way). *Got it* hides the coaching tips for the day, *Hide tips for this exercise* mutes them for good; pain notes always show. Settings → Workout → *Safety Tips* turns it all off and un-mutes exercises. Trace sees pain flags and has safety rules (never push through pain, no heavier loads on a pain-flagged lift, recommend a doctor/physical therapist for warning signs, small progression steps, encourage without shaming). Tests: `scripts/safety.test.js`, `e2e/tests/safety.spec.js`. |
| 3 | **Suggestion engine.** The lifting version of the NutriTrace suggestions, in Settings → Workout → *Suggestions*: on/off, *How often* (Gentle: only protected areas · Balanced: + stalled lifts after 4 sessions and weekly gaps · Strict: stalls after 3, gaps sooner), *Protect these areas* (shoulder, elbow, wrist, lower back, hip, knee, ankle, neck), *Equipment I have*, and a *Never suggest* list. On each exercise card: *Easy on your shoulder…* when an exercise loads a protected area, and a stalled-lift tip (waits while a deload tip is showing); both have *See swaps*. *Suggest a swap* in each exercise's ⋮ menu works even with suggestions off: up to 5 ranked alternatives (same muscles, filtered by your settings, ones you've done before nudged up) with reasons, *Use* (swaps in place, keeps sets) and *Never suggest*. On today's Diary, a *This week* card names major muscle groups with no work in 7 days with one-tap *Add* (quiet until you've logged 2 workouts that week; *Not today* hides it). Trace gets your protected areas, never-suggest list and equipment. Tests: `scripts/suggestions.test.js`, `e2e/tests/suggestions.spec.js`. |
| 4 | **Progress planning.** *Your week* card on today's Diary: pick the days you train (sheet with weekday chips); the active program's workouts are laid over the next 7 days in rotation, continuing after the last one you completed so a missed day moves the plan instead of skipping a workout; rest days are shown as part of the plan; *Start {workout}* loads today's into the Diary. No active program? The sheet suggests a starter for your days a week (≤3 Full Body 3x, 4 Upper / Lower, 5+ Push / Pull / Legs) with one-tap *Use*. *Weekly check-in* card (once a week until *Got it*): last week's workouts vs your weekly goal and sets, plus one adjustment: a very hard week (most top sets RPE 9+) says hold, never add; then consistency; then too much volume for a group (>20 sets); then too little (<10 sets); otherwise add a little weight where you hit all reps. *Strength goal* on each exercise page: set a target estimated 1RM; shows *Now about X* and a projected date from the last 8 weeks' trend, capped at 1.5% a week and labelled an estimate; *flat* and *not enough data* say so instead of guessing. Trace gets your goals and training days. Tests: `scripts/planner.test.js`, `e2e/tests/planning.spec.js`. |

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
