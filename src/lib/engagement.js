/**
 * Fork patch 5: engagement. Pure functions (unit-tested in
 * scripts/engagement.test.js).
 *
 * Encourager rules:
 *  - Streaks count WEEKS that hit your weekly goal, never consecutive days,
 *    so rest days can't break one. The current week only adds once it's
 *    met; an unfinished week never breaks the streak early.
 *  - Celebrate consistency (workouts, weeks) as much as strength (PRs,
 *    volume). No body-weight milestones.
 */
import { addDays, weekStart } from './planner.js';
import { isTimedSet } from './workout.js';

// ── weekly streak ────────────────────────────────────────────────────
/**
 * @param {Iterable<string>} dates  days with a workout (YYYY-MM-DD)
 * @param {number} goal             workouts per week to count the week
 * @param {string} today
 * @returns {{ weeks, thisWeek, goal, metThisWeek, longest }}
 */
export function weekStreak(dates, goal, today) {
  const g = Math.max(1, Number(goal) || 1);
  const perWeek = new Map();
  for (const d of dates || []) {
    if (typeof d !== 'string' || d > today) continue;
    const w = weekStart(d);
    perWeek.set(w, (perWeek.get(w) || 0) + 1);
  }
  const thisMon = weekStart(today);
  const thisWeek = perWeek.get(thisMon) || 0;
  const met = (w) => (perWeek.get(w) || 0) >= g;

  let weeks = met(thisMon) ? 1 : 0;
  for (let w = addDays(thisMon, -7); met(w); w = addDays(w, -7)) weeks++;

  let longest = 0, run = 0;
  const all = [...perWeek.keys()].sort();
  if (all.length) {
    for (let w = all[0]; w <= thisMon; w = addDays(w, 7)) {
      run = met(w) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  return { weeks, thisWeek, goal: g, metThisWeek: met(thisMon), longest };
}

// ── totals and milestones ────────────────────────────────────────────
/** Volume of one workout row: Σ weight × reps over completed working rep sets. */
export function workoutVolume(w) {
  let v = 0;
  for (const ex of w?.exercises || []) {
    for (const s of ex?.sets || []) {
      if (!s?.completed || s.warmup || isTimedSet(ex, s)) continue;
      v += (Number(s.weight) || 0) * (Number(s.reps) || 0);
    }
  }
  return v;
}
const _trained = (w) => (w?.exercises || []).some((ex) => (ex.sets || []).some((s) => s?.completed && !s.warmup));

export function totals(workouts) {
  const days = new Set();
  let volume = 0, sets = 0;
  for (const w of workouts || []) {
    if (!_trained(w)) continue;
    days.add(w.date);
    volume += workoutVolume(w);
    for (const ex of w.exercises || []) sets += (ex.sets || []).filter((s) => s?.completed && !s.warmup).length;
  }
  return { workouts: days.size, volume, sets };
}

export const WORKOUT_MILESTONES = [1, 10, 25, 50, 100, 150, 200, 300, 500, 750, 1000];
export const WEEK_MILESTONES = [4, 8, 12, 26, 52, 104];
/** Lifetime volume milestones, in lbs (kg users: converted when shown). */
export const VOLUME_MILESTONES = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];

/**
 * Milestones crossed between `before` and `after` totals (and streaks).
 * Returns [{ kind: 'workouts'|'weeks'|'volume', value }], biggest first.
 */
export function crossedMilestones(before, after) {
  const out = [];
  const cross = (list, a, b, kind) => {
    for (const m of list) if ((a || 0) < m && (b || 0) >= m) out.push({ kind, value: m });
  };
  cross(WORKOUT_MILESTONES, before?.workouts, after?.workouts, 'workouts');
  cross(WEEK_MILESTONES, before?.weeks, after?.weeks, 'weeks');
  cross(VOLUME_MILESTONES, before?.volumeLbs, after?.volumeLbs, 'volume');
  return out.reverse();
}

/** All milestones earned so far (for the Statistics list). */
export function earnedMilestones({ workouts = 0, longestWeeks = 0, volumeLbs = 0 } = {}) {
  return [
    ...WORKOUT_MILESTONES.filter((m) => workouts >= m).map((value) => ({ kind: 'workouts', value })),
    ...WEEK_MILESTONES.filter((m) => longestWeeks >= m).map((value) => ({ kind: 'weeks', value })),
    ...VOLUME_MILESTONES.filter((m) => volumeLbs >= m).map((value) => ({ kind: 'volume', value })),
  ];
}

// ── real-world comparisons ───────────────────────────────────────────
/** Rough weights in lbs. Fun, not physics: rounded, familiar things. */
export const THINGS = [
  { key: 'blue_whale', lbs: 300_000 },
  { key: 'space_shuttle', lbs: 165_000 },
  { key: 'school_bus', lbs: 25_000 },
  { key: 'elephant', lbs: 13_000 },
  { key: 'car', lbs: 4_000 },
  { key: 'piano', lbs: 1_000 },
  { key: 'bear', lbs: 600 },
  { key: 'fridge', lbs: 250 },
];

/**
 * The best comparison for a volume: the biggest thing you lifted at least
 * once, as "about N <things>". `unit` is the volume's unit.
 * Returns { key, count } or null for tiny volumes.
 */
export function compareVolume(volume, unit = 'lbs') {
  const lbs = unit === 'kg' ? volume * 2.20462 : volume;
  for (const t of THINGS) {
    const n = lbs / t.lbs;
    if (n >= 1) return { key: t.key, count: n >= 10 ? Math.round(n) : Math.round(n * 10) / 10 };
  }
  return null;
}

// ── monthly recap ────────────────────────────────────────────────────
/** 'YYYY-MM' of the month before `today`'s. */
export function previousMonth(today) {
  const [y, m] = today.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * One month in numbers. `prev` is the month before it (for "+N vs last
 * month"). Returns null for a month with nothing logged.
 */
export function monthlyRecap(workouts, month) {
  const inMonth = (w, mm) => typeof w?.date === 'string' && w.date.startsWith(mm + '-') && _trained(w);
  const rows = (workouts || []).filter((w) => inMonth(w, month));
  if (!rows.length) return null;
  const t = totals(rows);
  const byEx = new Map();
  for (const w of rows) {
    for (const ex of w.exercises || []) {
      const n = (ex.sets || []).filter((s) => s?.completed && !s.warmup).length;
      if (!n || !ex.exercise_name) continue;
      byEx.set(ex.exercise_name, (byEx.get(ex.exercise_name) || 0) + n);
    }
  }
  const top = [...byEx.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const [y, m] = month.split('-').map(Number);
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const prev = totals((workouts || []).filter((w) => inMonth(w, prevMonth)));
  return {
    month, workouts: t.workouts, sets: t.sets, volume: t.volume,
    topExercise: top ? { name: top[0], sets: top[1] } : null,
    vsPrev: prev.workouts ? t.workouts - prev.workouts : null,
  };
}
