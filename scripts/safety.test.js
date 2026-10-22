/**
 * Fork patch 2: the safety layer's rules (src/lib/safety.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  topRpe, topWeight, deloadCheck, painCheck, loadJumpCheck, safetyNotes, makePainFlag,
} from '../src/lib/safety.js';

const set = (weight, reps, extra = {}) => ({ weight, reps, completed: true, ...extra });
const day = (date, sets, extra = {}) => ({ date, sets, ...extra });

test('top RPE and top weight ignore warm-ups and unticked sets', () => {
  const e = day('2026-10-01', [
    set(135, 5, { warmup: true, rpe: 10 }),
    set(185, 5, { rpe: 8 }),
    { weight: 225, reps: 5, rpe: 10, completed: false },
    set(195, 3, { rpe: 9 }),
  ]);
  assert.equal(topRpe(e), 9);
  assert.equal(topWeight(e), 195);
  assert.equal(topRpe(day('x', [set(100, 5)])), null, 'no RPE logged → null');
});

test('deload: three hard sessions in a row', () => {
  const h = [
    day('2026-10-20', [set(200, 3, { rpe: 9.5 })]),
    day('2026-10-17', [set(200, 3, { rpe: 9 })]),
    day('2026-10-14', [set(195, 3, { rpe: 10 })]),
    day('2026-10-10', [set(190, 3, { rpe: 7 })]),
  ];
  assert.deepEqual(deloadCheck(h, { before: '2026-10-22' }), { rpes: [9.5, 9, 10] });
});

test('deload: one easier session, a missing RPE, or too few sessions → nothing', () => {
  const hard = (d) => day(d, [set(200, 3, { rpe: 9 })]);
  assert.equal(deloadCheck([hard('2026-10-20'), day('2026-10-17', [set(200, 3, { rpe: 8 })]), hard('2026-10-14')], { before: '2026-10-22' }), null);
  assert.equal(deloadCheck([hard('2026-10-20'), day('2026-10-17', [set(200, 3)]), hard('2026-10-14')], { before: '2026-10-22' }), null);
  assert.equal(deloadCheck([hard('2026-10-20'), hard('2026-10-17')], { before: '2026-10-22' }), null);
});

test('deload: today and later days are not history; empty sessions are skipped', () => {
  const hard = (d) => day(d, [set(200, 3, { rpe: 9 })]);
  const h = [hard('2026-10-22'), day('2026-10-21', [{ weight: 200, reps: 3 }]), hard('2026-10-20'), hard('2026-10-17'), day('2026-10-14', [set(200, 3, { rpe: 6 })])];
  assert.equal(deloadCheck(h, { before: '2026-10-22' }), null, "today's session must not count");
  assert.deepEqual(deloadCheck([hard('2026-10-21'), ...h.slice(1)], { before: '2026-10-22' }), { rpes: [9, 9, 9] });
});

test('pain: last session flagged, with its note', () => {
  const h = [day('2026-10-20', [set(100, 5)], { pain: { at: 'x', note: 'test ache' } }), day('2026-10-15', [set(100, 5)])];
  const p = painCheck(h, { before: '2026-10-22' });
  assert.deepEqual(p.last, { date: '2026-10-20', note: 'test ache' });
  assert.equal(p.repeat, null);
});

test('pain: keeps coming back within 30 days → repeat', () => {
  const h = [
    day('2026-10-20', [set(100, 5)], { pain: { note: '' } }),
    day('2026-10-15', [set(100, 5)]),
    day('2026-10-01', [set(100, 5)], { pain: true }),
    day('2026-08-01', [set(100, 5)], { pain: true }),
  ];
  assert.deepEqual(painCheck(h, { before: '2026-10-22' }).repeat, { count: 2 });
  assert.equal(painCheck(h.slice(1), { before: '2026-10-22' }).repeat, null, 'one flag in 30 days is not a pattern');
});

test('load jump: >10% and ≥15 lb over last top set', () => {
  const h = [day('2026-10-20', [set(185, 5), set(185, 5)])];
  assert.deepEqual(loadJumpCheck([{ weight: 225, reps: 5 }], h, { before: '2026-10-22' }), { from: 185, to: 225 });
  assert.equal(loadJumpCheck([{ weight: 195, reps: 5 }], h, { before: '2026-10-22' }), null, 'normal progression');
  assert.equal(loadJumpCheck([{ weight: 225, reps: 5, warmup: true }], h, { before: '2026-10-22' }), null, 'warm-ups never count');
  assert.equal(loadJumpCheck([{ weight: 25 }], [day('2026-10-20', [set(20, 10)])], { before: '2026-10-22' }), null, 'small absolute jump stays quiet');
  assert.deepEqual(loadJumpCheck([{ weight: 100 }], [day('2026-10-20', [set(80, 5)])], { before: '2026-10-22', unit: 'kg' }), { from: 80, to: 100 });
  assert.equal(loadJumpCheck([{ weight: 225 }], [], { before: '2026-10-22' }), null, 'first time doing the lift');
});

test('safetyNotes: priority, today-only flag, and mute keeps pain notes', () => {
  const h = [
    day('2026-10-20', [set(185, 3, { rpe: 9 })], { pain: true }),
    day('2026-10-17', [set(185, 3, { rpe: 9 })]),
    day('2026-10-14', [set(185, 3, { rpe: 9 })]),
  ];
  const base = { history: h, currentSets: [{ weight: 225 }], before: '2026-10-22' };
  assert.deepEqual(safetyNotes(base).map((n) => n.kind), ['pain_last', 'deload', 'jump']);
  assert.deepEqual(safetyNotes({ ...base, muted: true }).map((n) => n.kind), ['pain_last']);
  assert.deepEqual(safetyNotes({ ...base, painToday: true, muted: true }).map((n) => n.kind), ['pain_today']);
  const two = [{ ...h[0] }, { ...h[1], pain: true }, h[2]];
  const n = safetyNotes({ history: two, before: '2026-10-22', painToday: true });
  assert.deepEqual(n.find((x) => x.kind === 'pain_repeat'), { kind: 'pain_repeat', count: 3 });
});

test('pain flag shape', () => {
  const f = makePainFlag('x'.repeat(300));
  assert.equal(f.note.length, 200);
  assert.ok(!Number.isNaN(Date.parse(f.at)));
});
