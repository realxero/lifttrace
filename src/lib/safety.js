/**
 * Fork: the safety layer. Pure functions, no UI, no fetches, so every rule
 * here is unit-tested (scripts/safety.test.js) and the Diary just renders
 * what these return.
 *
 * Tone rule for every message built from these: encourage, never scold.
 * A tip says what to try, not what the lifter did wrong.
 *
 * Inputs are exercise history entries as GET /api/workout/history/:id
 * returns them, newest first: { date, sets: [...], pain?, set_type? }.
 */
import { isTimedSet } from './workout.js';

/** Top-set RPE at or above this, on this many sessions in a row → deload tip. */
export const DELOAD_RPE = 9;
export const DELOAD_SESSIONS = 3;

/** Pain flagged on this many earlier sessions within this many days → see someone. */
export const PAIN_REPEAT_SESSIONS = 2;
export const PAIN_REPEAT_DAYS = 30;

/** A working weight more than this much above last time's top set → jump tip. */
export const JUMP_PCT = 0.10;
/** …and at least this much in absolute terms, so 20 → 25 lb curls stay quiet. */
export const JUMP_MIN = { lbs: 15, kg: 7.5 };

const _num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function _daysBetween(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(db - da) / 86_400_000;
}

/** Completed working (non-warm-up) sets of a history entry. */
export function workingSets(entry) {
  return (entry?.sets || []).filter((s) => s && s.completed && !s.warmup);
}

/** Highest RPE logged on a completed working set, or null when none was logged. */
export function topRpe(entry) {
  let top = null;
  for (const s of workingSets(entry)) {
    if (s.rpe == null || s.rpe === '') continue;
    const r = _num(s.rpe);
    if (r > 0 && (top == null || r > top)) top = r;
  }
  return top;
}

/** Heaviest completed working weight of a rep-based entry (timed sets don't count). */
export function topWeight(entry) {
  let top = 0;
  for (const s of workingSets(entry)) {
    if (isTimedSet({ set_type: entry?.set_type }, s)) continue;
    const w = _num(s.weight);
    if (w > top) top = w;
  }
  return top;
}

/** Sessions before `before` that have at least one completed working set, newest first. */
export function priorSessions(history, before) {
  return (history || []).filter((h) =>
    h && typeof h.date === 'string' && (!before || h.date < before) && workingSets(h).length > 0);
}

/**
 * Deload tip: the last DELOAD_SESSIONS sessions each had a top set at
 * DELOAD_RPE or harder. Every one of them must have RPE logged; a session
 * without RPE breaks the run, since we can't tell how it felt.
 * Returns { rpes: [newest…oldest] } or null.
 */
export function deloadCheck(history, { before } = {}) {
  const recent = priorSessions(history, before).slice(0, DELOAD_SESSIONS);
  if (recent.length < DELOAD_SESSIONS) return null;
  const rpes = recent.map(topRpe);
  if (rpes.some((r) => r == null || r < DELOAD_RPE)) return null;
  return { rpes };
}

/**
 * Pain follow-ups from earlier sessions.
 *   last:   the most recent earlier session was flagged → { date, note }
 *   repeat: PAIN_REPEAT_SESSIONS+ flagged sessions in the last PAIN_REPEAT_DAYS
 *           → { count } (suggest getting it checked)
 * Either can be null.
 */
export function painCheck(history, { before } = {}) {
  const prior = (history || []).filter((h) =>
    h && typeof h.date === 'string' && (!before || h.date < before));
  const newest = prior[0] || null;
  const last = newest && newest.pain
    ? { date: newest.date, note: typeof newest.pain === 'object' ? (newest.pain.note || '') : '' }
    : null;
  const ref = before || newest?.date;
  const flagged = ref
    ? prior.filter((h) => h.pain && _daysBetween(h.date, ref) <= PAIN_REPEAT_DAYS)
    : [];
  const repeat = flagged.length >= PAIN_REPEAT_SESSIONS ? { count: flagged.length } : null;
  return { last, repeat };
}

/**
 * Big-jump tip: a working set in today's sets (completed or just typed)
 * is more than JUMP_PCT and JUMP_MIN above last session's top weight.
 * Returns { from, to } or null.
 */
export function loadJumpCheck(currentSets, history, { before, unit = 'lbs', setType } = {}) {
  const last = priorSessions(history, before)[0];
  if (!last) return null;
  const from = topWeight(last);
  if (!(from > 0)) return null;
  let to = 0;
  for (const s of currentSets || []) {
    if (!s || s.warmup) continue;
    if (isTimedSet({ set_type: setType }, s)) continue;
    const w = _num(s.weight);
    if (w > to) to = w;
  }
  const min = JUMP_MIN[unit === 'kg' ? 'kg' : 'lbs'];
  if (to > from * (1 + JUMP_PCT) && to - from >= min) return { from, to };
  return null;
}

/**
 * Everything the card should show, in priority order. `muted` (the
 * per-exercise "don't show tips for this" setting) silences the coaching
 * tips (deload, jump) but never the lifter's own pain flags.
 */
export function safetyNotes({ history, currentSets, before, unit = 'lbs', setType, painToday = false, muted = false } = {}) {
  const notes = [];
  const pain = painCheck(history, { before });
  if (painToday) notes.push({ kind: 'pain_today' });
  if (pain.repeat) notes.push({ kind: 'pain_repeat', count: pain.repeat.count + (painToday ? 1 : 0) });
  else if (pain.last && !painToday) notes.push({ kind: 'pain_last', date: pain.last.date, note: pain.last.note });
  if (!muted) {
    const deload = deloadCheck(history, { before });
    if (deload) notes.push({ kind: 'deload', rpes: deload.rpes });
    const jump = loadJumpCheck(currentSets, history, { before, unit, setType });
    if (jump) notes.push({ kind: 'jump', from: jump.from, to: jump.to });
  }
  return notes;
}

/** Shape of the pain flag stored on a workout exercise. */
export function makePainFlag(note = '') {
  return { at: new Date().toISOString(), note: String(note || '').slice(0, 200) };
}
