/**
 * Fork patch 3: the suggestion engine's rules (src/lib/suggestions.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  areasLoaded, isAllowed, hasEquipment, suggestSwaps, stallCheck, muscleGaps,
  pickForGroup, cleanPrefs, promptLine,
} from '../src/lib/suggestions.js';

const ex = (id, name, prim, equipment = ['barbell'], sec = []) =>
  ({ id, name, primary_muscles: prim, secondary_muscles: sec, equipment });
const LIB = [
  ex(1, 'Barbell Overhead Press', ['shoulders'], ['barbell'], ['triceps']),
  ex(2, 'Dumbbell Lateral Raise', ['shoulders'], ['dumbbell']),
  ex(3, 'Cable Face Pull', ['shoulders', 'upper back'], ['cable']),
  ex(4, 'Barbell Back Squat', ['quadriceps'], ['barbell'], ['glutes']),
  ex(5, 'Leg Press', ['quadriceps'], ['machine'], ['glutes']),
  ex(6, 'Romanian Deadlift', ['hamstrings'], ['barbell'], ['glutes']),
  ex(7, 'Lying Leg Curl', ['hamstrings'], ['machine']),
  ex(8, 'Bench Press', ['chest'], ['barbell'], ['triceps']),
  ex(9, 'Push-Up', ['chest'], ['body weight'], ['triceps']),
  ex(10, 'Barbell Row', ['lats'], ['barbell']),
  ex(11, 'Hip Thrust', ['glutes'], ['barbell']),
  ex(12, 'Cable Fly', ['chest'], ['cable']),
];
const set = (weight, reps, extra = {}) => ({ weight, reps, completed: true, ...extra });

test('protected areas are matched on the movement, not just the muscle', () => {
  assert.deepEqual(areasLoaded(LIB[0], ['shoulder', 'knee']), ['shoulder']);
  assert.deepEqual(areasLoaded(LIB[3], ['knee', 'lower_back']), ['knee', 'lower_back']);
  assert.deepEqual(areasLoaded(LIB[6], ['knee', 'lower_back']), [], 'leg curl is fine for knees and back');
  assert.deepEqual(areasLoaded({ exercise_name: 'Dips' }, ['shoulder', 'elbow']), ['shoulder', 'elbow']);
});

test('allowed: never list, protected areas and equipment all filter', () => {
  const p = cleanPrefs({ protect: ['shoulder'], never: [{ id: 2, name: 'Dumbbell Lateral Raise' }], equipment: ['Cable', 'Machine'] });
  assert.equal(isAllowed(LIB[0], p), false, 'overhead press loads the shoulder');
  assert.equal(isAllowed(LIB[1], p), false, 'never-suggest by id');
  assert.equal(isAllowed({ name: 'dumbbell lateral raise' }, p), false, 'never-suggest by name');
  assert.equal(isAllowed(LIB[2], p), true);
  assert.equal(isAllowed(LIB[5], p), false, 'no barbell today');
  assert.equal(hasEquipment(LIB[8], p), true, 'bodyweight always counts');
  assert.equal(hasEquipment(LIB[5], cleanPrefs({})), true, 'no equipment set = everything');
});

test('swaps: same muscles, filtered, with reasons; familiar ones nudge up', () => {
  const p = cleanPrefs({ protect: ['shoulder'] });
  const s = suggestSwaps(LIB[0], LIB, p, { limit: 3 });
  assert.deepEqual(s.map((x) => x.exercise.name), ['Cable Face Pull']);
  assert.ok(s.every((x) => x.exercise.id !== 1));
  assert.ok(s[0].reasons.includes('protects'));
  assert.ok(!s.some((x) => /raise/i.test(x.exercise.name)), 'lateral raises load the shoulder too');

  const squatSwaps = suggestSwaps(LIB[3], LIB, cleanPrefs({}), { usage: { 5: { count: 9 } } });
  assert.equal(squatSwaps[0].exercise.name, 'Leg Press');
  assert.ok(squatSwaps[0].reasons.includes('done_before'));
  assert.deepEqual(suggestSwaps(LIB[3], LIB, cleanPrefs({ protect: ['knee'] })).map((x) => x.exercise.name), [], 'no knee-friendly quad swap in this tiny library');
});

test('stall: no better best set over the window', () => {
  const h = [
    { date: '2026-10-20', sets: [set(185, 5)] },
    { date: '2026-10-17', sets: [set(185, 4)] },
    { date: '2026-10-14', sets: [set(185, 5)] },
    { date: '2026-10-10', sets: [set(185, 5), set(135, 10, { warmup: true })] },
  ];
  assert.deepEqual(stallCheck(h, { before: '2026-10-22' }), { sessions: 4, top: { weight: 185, reps: 5 } });
  assert.deepEqual(stallCheck(h, { before: '2026-10-22', strictness: 'strict' })?.sessions, 3);
  assert.equal(stallCheck(h, { before: '2026-10-22', strictness: 'gentle' }), null, 'gentle never says stalled');
  const progressing = [{ date: '2026-10-20', sets: [set(190, 5)] }, ...h.slice(1)];
  assert.equal(stallCheck(progressing, { before: '2026-10-22' }), null);
  assert.equal(stallCheck(h.slice(0, 3), { before: '2026-10-22' }), null, 'not enough sessions');
});

test('muscle gaps: quiet for new users and on gentle; picks an allowed exercise', () => {
  const w = (date, ids) => ({ date, exercises: ids.map((id) => ({ exercise_id: id, sets: [set(100, 5)] })) });
  const recent = [w('2026-10-21', [8, 10]), w('2026-10-19', [4, 1])];
  const gaps = muscleGaps(recent, LIB, { strictness: 'balanced' }, { today: '2026-10-22' });
  assert.deepEqual(gaps.map((g) => g.group), ['hamstrings', 'glutes']);
  assert.equal(gaps[0].suggestion.name, 'Romanian Deadlift');
  assert.deepEqual(muscleGaps(recent.slice(0, 1), LIB, { strictness: 'balanced' }, { today: '2026-10-22' }), [], 'one workout is too early to judge');
  assert.deepEqual(muscleGaps(recent, LIB, { strictness: 'gentle' }, { today: '2026-10-22' }), []);
  const old = [w('2026-10-01', [6, 11]), ...recent];
  assert.deepEqual(muscleGaps(old, LIB, {}, { today: '2026-10-22' }).map((g) => g.group), ['hamstrings', 'glutes'], 'older than 7 days does not count');
  const backSafe = muscleGaps(recent, LIB, { protect: ['lower_back'] }, { today: '2026-10-22' });
  assert.equal(backSafe[0].suggestion.name, 'Lying Leg Curl', 'RDL loads the lower back');
});

test('pickForGroup prefers what you already do', () => {
  assert.equal(pickForGroup('chest', LIB, {}, { 12: { count: 5 } }).name, 'Cable Fly');
});

test('Trace prompt line', () => {
  assert.equal(promptLine({}), '');
  const line = promptLine({ protect: ['shoulder', 'lower_back'], never: [{ id: 1, name: 'Burpee' }], equipment: ['Dumbbell'] });
  assert.match(line, /Protect: shoulder, lower back/);
  assert.match(line, /Never suggest: Burpee\./);
  assert.match(line, /Equipment available: Dumbbell/);
});
