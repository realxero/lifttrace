/**
 * Fork patch 4: progress planning. Pure functions (unit-tested in
 * scripts/planner.test.js):
 *   planWeek      — your training days → which program workout goes on each
 *   projectGoal   — estimated date to reach a strength goal, from your e1RM trend
 *   weeklyCheckin — last week in one line + one adjustment for this week
 *
 * Safe-encourager rules baked in: projections are capped at a sustainable
 * pace and say "estimate"; a very hard week never gets "add weight"; rest
 * days are part of the plan, not gaps in it.
 */
import { normalizeMuscle } from './muscle-groups.js';
import { isTimedSet } from './workout.js';

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];   // Mon..Sun, as Date#getDay()

// ── dates (calendar days, no time zones) ─────────────────────────────
const _t = (ymd) => Date.parse(`${ymd}T12:00:00Z`);
export function addDays(ymd, n) {
  const d = new Date(_t(ymd)); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekdayOf(ymd) { return new Date(_t(ymd)).getUTCDay(); }
/** Monday of the week `ymd` is in. */
export function weekStart(ymd) {
  const wd = weekdayOf(ymd);
  return addDays(ymd, wd === 0 ? -6 : 1 - wd);
}
const _daysBetween = (a, b) => Math.round((_t(b) - _t(a)) / 86_400_000);

/** Completed working sets of one workout-log exercise entry. */
const _done = (ex) => (ex?.sets || []).filter((s) => s?.completed && !s.warmup);
/** Did anything get done in this workout row? */
export function isTrained(w) { return (w?.exercises || []).some((ex) => _done(ex).length > 0); }

// ── week planner ─────────────────────────────────────────────────────
/** A starter program to suggest for N days a week (seeded template names). */
export function recommendStarter(daysPerWeek) {
  if (daysPerWeek >= 5) return 'Push / Pull / Legs';
  if (daysPerWeek === 4) return 'Upper / Lower';
  return 'Full Body 3x';
}

/**
 * Lay the program's workouts over the next 7 days (today first).
 *   templates:     the active program's templates in order ([{id, name}])
 *   trainingDays:  weekdays you train (0=Sun … 6=Sat)
 *   recent:        recent workout rows ({date, template_id, exercises})
 * Rotation continues after the last program workout you completed, so a
 * missed day pushes the plan forward instead of skipping a workout.
 * Returns [{ date, weekday, kind: 'done'|'train'|'rest', template }].
 */
export function planWeek({ templates = [], trainingDays = [], today, recent = [] } = {}) {
  if (!today) return [];
  const ids = templates.map((t) => Number(t.id));
  const byDate = new Map();
  for (const w of recent || []) if (isTrained(w)) byDate.set(w.date, w);

  // Next in rotation: after the most recent completed program workout before today.
  let next = 0;
  const past = [...(recent || [])]
    .filter((w) => w.date < today && isTrained(w) && ids.includes(Number(w.template_id)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (past.length) next = (ids.indexOf(Number(past[0].template_id)) + 1) % ids.length;

  const days = new Set(trainingDays.map(Number));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const weekday = weekdayOf(date);
    const done = byDate.get(date);
    if (done) {
      const t = templates.find((x) => Number(x.id) === Number(done.template_id)) || null;
      out.push({ date, weekday, kind: 'done', template: t, name: done.name || t?.name || '' });
      if (t) next = (ids.indexOf(Number(t.id)) + 1) % ids.length;
      continue;
    }
    if (days.has(weekday) && templates.length) {
      out.push({ date, weekday, kind: 'train', template: templates[next] });
      next = (next + 1) % templates.length;
    } else {
      out.push({ date, weekday, kind: days.has(weekday) ? 'train' : 'rest', template: null });
    }
  }
  return out;
}

// ── goal projection ──────────────────────────────────────────────────
export function e1rm(weight, reps) {
  const w = Number(weight) || 0, r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

/** Best e1RM per session from exercise history (newest-first in, oldest-first out). */
export function e1rmSeries(history) {
  const out = [];
  for (const h of history || []) {
    let best = 0;
    for (const s of h?.sets || []) {
      if (!s?.completed || s.warmup || isTimedSet({ set_type: h.set_type }, s)) continue;
      best = Math.max(best, e1rm(s.weight, s.reps));
    }
    if (best > 0) out.push({ date: h.date, e1rm: best });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The fastest pace a projection will assume: 1.5% of current e1RM a week. */
export const MAX_WEEKLY_GAIN = 0.015;
export const PROJECTION_WINDOW_DAYS = 56;

/**
 * When will the estimated 1RM reach `target`?
 * Uses a least-squares trend over the last 8 weeks (≥4 sessions spanning
 * ≥14 days), capped at MAX_WEEKLY_GAIN so a lucky month can't promise
 * a fantasy date. Returns one of:
 *   { status: 'reached', current }
 *   { status: 'on_pace', current, date, weeks, perWeek, capped }
 *   { status: 'flat', current }            trend not going up
 *   { status: 'not_enough', sessions }     too little data
 */
export function projectGoal(history, target, { today } = {}) {
  const t = Number(target) || 0;
  const series = e1rmSeries(history);
  const current = series.length ? Math.max(...series.slice(-3).map((p) => p.e1rm)) : 0;
  if (t > 0 && current >= t) return { status: 'reached', current: Math.round(current) };
  const end = today || series[series.length - 1]?.date;
  const recent = end ? series.filter((p) => _daysBetween(p.date, end) <= PROJECTION_WINDOW_DAYS && p.date <= end) : [];
  if (recent.length < 4 || _daysBetween(recent[0].date, recent[recent.length - 1].date) < 14) {
    return { status: 'not_enough', sessions: recent.length };
  }
  const xs = recent.map((p) => _daysBetween(recent[0].date, p.date));
  const ys = recent.map((p) => p.e1rm);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const perDay = den ? num / den : 0;
  let perWeek = perDay * 7;
  if (perWeek <= 0.1) return { status: 'flat', current: Math.round(current) };
  const cap = current * MAX_WEEKLY_GAIN;
  const capped = perWeek > cap;
  if (capped) perWeek = cap;
  const weeks = Math.ceil((t - current) / perWeek);
  return {
    status: 'on_pace', current: Math.round(current), perWeek: Math.round(perWeek * 10) / 10,
    weeks, capped, date: addDays(end, weeks * 7),
  };
}

// ── weekly check-in ──────────────────────────────────────────────────
export const MAJOR_GROUPS = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes'];
/** Weekly working-set range most lifters grow well in, per muscle group. */
export const SETS_LOW = 10;
export const SETS_HIGH = 20;

/**
 * Last full week (Mon–Sun before `today`'s week) in numbers, plus one
 * adjustment for this week. `goal` is the weekly workouts goal.
 * Returns null when last week had nothing logged (nothing to check in on).
 */
export function weeklyCheckin(recent, library, { today, goal = 3 } = {}) {
  if (!today) return null;
  const thisMon = weekStart(today);
  const lastMon = addDays(thisMon, -7);
  const week = (recent || []).filter((w) => w.date >= lastMon && w.date < thisMon && isTrained(w));
  if (!week.length) return null;
  const byId = new Map((library || []).map((e) => [Number(e.id), e]));
  const sets = Object.fromEntries(MAJOR_GROUPS.map((g) => [g, 0]));
  let total = 0, hardTop = 0, rpeTop = 0;
  const sessionDays = new Set();
  for (const w of week) {
    sessionDays.add(w.date);
    for (const ex of w.exercises || []) {
      const done = _done(ex);
      if (!done.length) continue;
      total += done.length;
      const rpes = done.map((s) => Number(s.rpe)).filter((r) => r > 0);
      if (rpes.length) { rpeTop++; if (Math.max(...rpes) >= 9) hardTop++; }
      const lib = byId.get(Number(ex.exercise_id));
      for (const g of new Set((lib?.primary_muscles || []).map(normalizeMuscle))) if (g in sets) sets[g] += done.length;
    }
  }
  const sessions = sessionDays.size;
  const low = MAJOR_GROUPS.filter((g) => sets[g] > 0 && sets[g] < SETS_LOW);
  const missing = MAJOR_GROUPS.filter((g) => sets[g] === 0);
  const high = MAJOR_GROUPS.filter((g) => sets[g] > SETS_HIGH);

  // One adjustment, most important first.
  let advice;
  if (rpeTop >= 2 && hardTop / rpeTop >= 0.6) advice = { kind: 'hold_hard' };
  else if (sessions < goal) advice = { kind: 'consistency', sessions, goal };
  else if (high.length) advice = { kind: 'too_much', group: high[0], sets: sets[high[0]] };
  else if (low.length) advice = { kind: 'add_sets', group: low[0], sets: sets[low[0]] };
  else advice = { kind: 'progress' };

  return { weekOf: lastMon, sessions, goal, totalSets: total, sets, missing, advice };
}
