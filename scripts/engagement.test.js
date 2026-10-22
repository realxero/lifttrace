/**
 * Fork patch 5: engagement (src/lib/engagement.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekStreak, workoutVolume, totals, crossedMilestones, earnedMilestones, compareVolume, monthlyRecap, previousMonth,
} from '../src/lib/engagement.js';

// Thursday 2026-10-22; weeks start Mon 10-19, 10-12, 10-05, 09-28, 09-21.
const T = '2026-10-22';

test('weekly streak: rest days never break it', () => {
  const dates = ['2026-10-12', '2026-10-15', '2026-10-17', '2026-10-05', '2026-10-07', '2026-10-09', '2026-09-28', '2026-09-30', '2026-10-02'];
  const s = weekStreak(dates, 3, T);
  assert.equal(s.weeks, 3, 'three full weeks at 3+, with 4 rest days in each');
  assert.equal(s.thisWeek, 0);
  assert.equal(s.metThisWeek, false, 'an unfinished week does not count yet, and does not break it');
});

test('weekly streak: this week adds once met; a short week breaks it; longest', () => {
  const dates = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-12', '2026-10-14', '2026-10-16', '2026-10-06', '2026-09-28', '2026-09-29', '2026-09-30', '2026-09-21', '2026-09-23', '2026-09-24'];
  const s = weekStreak(dates, 3, T);
  assert.equal(s.weeks, 2, 'this week + last week; the week of Oct 5 had one');
  assert.equal(s.metThisWeek, true);
  assert.equal(s.longest, 2);
  assert.equal(weekStreak(dates, 1, T).weeks, 5);
  assert.equal(weekStreak(['2026-10-23'], 1, T).weeks, 0, 'future days do not count');
});

const set = (weight, reps, extra = {}) => ({ weight, reps, completed: true, ...extra });
const w = (date, exs) => ({ date, exercises: exs.map(([name, sets]) => ({ exercise_name: name, sets })) });

test('volume and totals skip warm-ups, unticked and timed sets', () => {
  const row = w('2026-10-01', [['Bench', [set(100, 10), set(50, 10, { warmup: true }), { weight: 200, reps: 5 }]], ['Plank', [set(0, 0, { duration_sec: 60 })]]]);
  assert.equal(workoutVolume(row), 1000);
  const t = totals([row, w('2026-10-01', [['Row', [set(100, 5)]]]), w('2026-10-02', [['Row', [{ weight: 1, reps: 1 }]]])]);
  assert.deepEqual(t, { workouts: 1, volume: 1500, sets: 3 });
});

test('milestones: crossed between two points, biggest first; earned list', () => {
  assert.deepEqual(crossedMilestones({ workouts: 9, weeks: 3, volumeLbs: 49_000 }, { workouts: 10, weeks: 4, volumeLbs: 51_000 }),
    [{ kind: 'volume', value: 50_000 }, { kind: 'weeks', value: 4 }, { kind: 'workouts', value: 10 }]);
  assert.deepEqual(crossedMilestones({ workouts: 10 }, { workouts: 11 }), []);
  assert.deepEqual(crossedMilestones({ workouts: 0 }, { workouts: 1 }), [{ kind: 'workouts', value: 1 }], 'first workout ever');
  assert.equal(earnedMilestones({ workouts: 30, longestWeeks: 9, volumeLbs: 120_000 }).length, 3 + 2 + 3);
});

test('real-world comparisons pick the biggest thing lifted at least once', () => {
  assert.deepEqual(compareVolume(12_000), { key: 'car', count: 3 });
  assert.deepEqual(compareVolume(30_000), { key: 'school_bus', count: 1.2 });
  assert.deepEqual(compareVolume(2_000, 'kg'), { key: 'car', count: 1.1 });
  assert.deepEqual(compareVolume(5_000_000), { key: 'blue_whale', count: 17 });
  assert.equal(compareVolume(100), null);
});

test('monthly recap', () => {
  const rows = [
    w('2026-09-02', [['Bench', [set(100, 5), set(100, 5)]], ['Squat', [set(200, 5)]]]),
    w('2026-09-05', [['Bench', [set(100, 5)]]]),
    w('2026-08-30', [['Squat', [set(200, 5)]]]),
    w('2026-10-01', [['Squat', [set(200, 5)]]]),
  ];
  const r = monthlyRecap(rows, '2026-09');
  assert.deepEqual(r, { month: '2026-09', workouts: 2, sets: 4, volume: 2500, topExercise: { name: 'Bench', sets: 3 }, vsPrev: 1 });
  assert.equal(monthlyRecap(rows, '2026-07'), null);
  assert.equal(previousMonth('2026-01-15'), '2025-12');
  assert.equal(previousMonth(T), '2026-09');
});
