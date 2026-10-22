/**
 * Fork patch 4: progress planning (src/lib/planner.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, weekStart, weekdayOf, planWeek, recommendStarter, projectGoal, e1rmSeries, weeklyCheckin,
} from '../src/lib/planner.js';

const T = [{ id: 1, name: 'Push' }, { id: 2, name: 'Pull' }, { id: 3, name: 'Legs' }];
const done = (date, template_id, extra = {}) =>
  ({ date, template_id, exercises: [{ exercise_id: 1, sets: [{ weight: 100, reps: 5, completed: true }] }], ...extra });

test('dates: weeks start Monday', () => {
  assert.equal(weekdayOf('2026-10-22'), 4);           // Thursday
  assert.equal(weekStart('2026-10-22'), '2026-10-19');
  assert.equal(weekStart('2026-10-25'), '2026-10-19'); // Sunday belongs to the week before
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

test('planner: rotation continues after the last program workout', () => {
  // Thu 22nd; trains Mon/Wed/Fri; last did Push on Mon 19th.
  const plan = planWeek({ templates: T, trainingDays: [1, 3, 5], today: '2026-10-22', recent: [done('2026-10-19', 1)] });
  assert.equal(plan.length, 7);
  assert.deepEqual(plan.map((d) => d.kind), ['rest', 'train', 'rest', 'rest', 'train', 'rest', 'train']);
  assert.deepEqual(plan.filter((d) => d.template).map((d) => d.template.name), ['Pull', 'Legs', 'Push']);
});

test('planner: a missed day pushes the plan forward; today done counts', () => {
  const plan = planWeek({ templates: T, trainingDays: [4], today: '2026-10-22', recent: [done('2026-10-22', 2), done('2026-10-15', 1)] });
  assert.equal(plan[0].kind, 'done');
  assert.equal(plan[0].template.name, 'Pull');
  const nextThu = planWeek({ templates: T, trainingDays: [4, 5], today: '2026-10-22', recent: [done('2026-10-22', 2)] });
  assert.equal(nextThu[1].template.name, 'Legs', 'Friday follows today’s Pull');
  const untrained = planWeek({ templates: T, trainingDays: [4], today: '2026-10-22', recent: [{ date: '2026-10-22', template_id: 1, exercises: [{ sets: [{ completed: false }] }] }] });
  assert.equal(untrained[0].kind, 'train', 'a loaded but untouched workout is still to do');
});

test('planner: no program → training days without a workout; starter picks', () => {
  const plan = planWeek({ templates: [], trainingDays: [1, 4], today: '2026-10-22' });
  assert.deepEqual(plan.filter((d) => d.kind === 'train').map((d) => d.date), ['2026-10-22', '2026-10-26']);
  assert.equal(recommendStarter(2), 'Full Body 3x');
  assert.equal(recommendStarter(4), 'Upper / Lower');
  assert.equal(recommendStarter(6), 'Push / Pull / Legs');
});

const hist = (pairs) => pairs.map(([date, weight, reps]) => ({ date, sets: [{ weight, reps, completed: true }] })).reverse();

test('projection: steady trend gives a date, capped to a sustainable pace', () => {
  // ~+5 lb e1RM a week from 200.
  const h = hist([['2026-09-01', 180, 3], ['2026-09-08', 185, 3], ['2026-09-15', 190, 3], ['2026-09-22', 195, 3], ['2026-09-29', 200, 3]]);
  const p = projectGoal(h, 225, { today: '2026-10-01' });
  assert.equal(p.status, 'on_pace');
  assert.ok(p.capped, '+5 lb/week on ~218 e1RM is above 1.5%/week');
  assert.ok(p.perWeek <= 218 * 0.015 + 0.1);
  assert.ok(p.date > '2026-10-01');
  assert.equal(projectGoal(h, 150, { today: '2026-10-01' }).status, 'reached');
});

test('projection: flat or thin data never promises a date', () => {
  const flat = hist([['2026-09-01', 200, 3], ['2026-09-08', 200, 3], ['2026-09-15', 195, 3], ['2026-09-22', 200, 3]]);
  assert.equal(projectGoal(flat, 250, { today: '2026-10-01' }).status, 'flat');
  const thin = hist([['2026-09-20', 180, 3], ['2026-09-25', 190, 3]]);
  assert.deepEqual(projectGoal(thin, 250, { today: '2026-10-01' }), { status: 'not_enough', sessions: 2 });
  const old = hist([['2026-05-01', 150, 3], ['2026-05-08', 160, 3], ['2026-05-15', 170, 3], ['2026-05-22', 180, 3]]);
  assert.equal(projectGoal(old, 250, { today: '2026-10-01' }).status, 'not_enough', 'only the last 8 weeks count');
});

test('e1RM series skips warm-ups and unticked sets', () => {
  const s = e1rmSeries([{ date: '2026-10-01', sets: [{ weight: 300, reps: 1, warmup: true, completed: true }, { weight: 200, reps: 5, completed: true }, { weight: 250, reps: 5 }] }]);
  assert.equal(Math.round(s[0].e1rm), 233);
});

const LIB = [
  { id: 1, primary_muscles: ['chest'] }, { id: 2, primary_muscles: ['lats'] },
  { id: 3, primary_muscles: ['quadriceps'] }, { id: 4, primary_muscles: ['hamstrings'] },
];
const wk = (date, exs) => ({ date, exercises: exs.map(([id, n, rpe]) => ({ exercise_id: id, sets: Array.from({ length: n }, () => ({ weight: 100, reps: 5, completed: true, ...(rpe ? { rpe } : {}) })) })) });

test('check-in: last week only, one adjustment, most important first', () => {
  const today = '2026-10-22';   // last week = Oct 12–18
  const recent = [wk('2026-10-20', [[1, 9]]), wk('2026-10-16', [[1, 6], [2, 6]]), wk('2026-10-14', [[3, 12], [4, 4]]), wk('2026-10-12', [[1, 6], [2, 6]]), wk('2026-10-05', [[1, 30]])];
  const c = weeklyCheckin(recent, LIB, { today, goal: 3 });
  assert.equal(c.weekOf, '2026-10-12');
  assert.equal(c.sessions, 3);
  assert.equal(c.sets.chest, 12);
  assert.equal(c.sets.hamstrings, 4);
  assert.deepEqual(c.advice, { kind: 'add_sets', group: 'hamstrings', sets: 4 });
  assert.equal(weeklyCheckin(recent, LIB, { today, goal: 4 }).advice.kind, 'consistency');
});

test('check-in: a very hard week says hold, never add', () => {
  const recent = [wk('2026-10-13', [[1, 3, 9.5], [2, 3, 9]]), wk('2026-10-15', [[3, 3, 10]]), wk('2026-10-17', [[4, 3, 9]])];
  assert.equal(weeklyCheckin(recent, LIB, { today: '2026-10-22', goal: 3 }).advice.kind, 'hold_hard');
});

test('check-in: too much volume, and nothing logged → no card', () => {
  const recent = [wk('2026-10-13', [[1, 12], [2, 10], [3, 10], [4, 10]]), wk('2026-10-15', [[1, 12], [2, 10], [3, 10], [4, 10]]), wk('2026-10-17', [[2, 1]])];
  assert.deepEqual(weeklyCheckin(recent, LIB, { today: '2026-10-22', goal: 3 }).advice, { kind: 'too_much', group: 'chest', sets: 24 });
  assert.equal(weeklyCheckin([wk('2026-10-20', [[1, 3]])], LIB, { today: '2026-10-22' }), null);
});
