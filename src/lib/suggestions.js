/**
 * Fork patch 3: the suggestion engine. The lifting counterpart of the
 * NutriTrace fork's food suggestions: same on/off switch, same strictness
 * levels, same "never suggest this" list, plus body areas to protect and
 * the equipment you have.
 *
 * Pure functions only (unit-tested in scripts/suggestions.test.js); the
 * Diary, the swap sheet and Trace render what these return.
 *
 * prefs = {
 *   enabled:     boolean,
 *   strictness:  'gentle' | 'balanced' | 'strict',
 *   protect:     ['shoulder', 'knee', ...]  (AREAS keys)
 *   never:       [{ id, name }]             exercises never to suggest
 *   equipment:   ['Barbell', 'Dumbbell', ...] buckets you have; empty = all
 * }
 */
import { findSimilarExercises } from './exerciseSimilarity.js';
import { normalizeEquipment } from './equipment.js';
import { normalizeMuscle } from './muscle-groups.js';
import { isTimedSet } from './workout.js';

export const STRICTNESS = ['gentle', 'balanced', 'strict'];

/**
 * Body areas you can ask to protect, and the movements that load each one
 * hard. Matched on the exercise name, since libraries tag muscles but not
 * joints. Deliberately conservative: a false "easy on your knee" costs a
 * glance; a missed one can cost a session.
 */
export const AREAS = {
  shoulder:   /overhead|military|shoulder press|\bohp\b|push press|behind[- ]the[- ]neck|upright row|\bdips?\b|snatch|jerk|handstand|arnold|lateral raise|bench press|incline press/i,
  elbow:      /skull ?crusher|lying triceps|french press|triceps extension|close[- ]grip|preacher|\bdips?\b|chin[- ]?up/i,
  wrist:      /front squat|clean|snatch|wrist curl|push[- ]?up|handstand|reverse curl|zottman/i,
  lower_back: /deadlift|good ?morning|bent[- ]?over|barbell row|pendlay|hyperextension|back extension|jefferson|clean|snatch|back squat|barbell squat/i,
  hip:        /sumo|lunge|split squat|hip thrust|good ?morning|pistol|adductor|abductor/i,
  knee:       /squat|lunge|leg extension|leg press|pistol|jump|step[- ]?up|hack/i,
  ankle:      /jump|box jump|calf raise|skip|sprint|lunge|pistol/i,
  neck:       /shrug|behind[- ]the[- ]neck|\bneck\b|upright row|headstand/i,
};
export const AREA_KEYS = Object.keys(AREAS);

/** Major muscle groups a week of lifting should touch. */
export const MAJOR_GROUPS = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes'];

const _lc = (s) => String(s || '').toLowerCase();

export function defaultPrefs() {
  return { enabled: true, strictness: 'balanced', protect: [], never: [], equipment: [] };
}

export function cleanPrefs(p = {}) {
  const d = defaultPrefs();
  return {
    enabled: p.enabled !== false,
    strictness: STRICTNESS.includes(p.strictness) ? p.strictness : d.strictness,
    protect: Array.isArray(p.protect) ? p.protect.filter((a) => AREA_KEYS.includes(a)) : [],
    never: Array.isArray(p.never) ? p.never.filter((n) => n && (n.id != null || n.name)) : [],
    equipment: Array.isArray(p.equipment) ? p.equipment.filter(Boolean) : [],
  };
}

/** Protected areas this exercise loads hard. */
export function areasLoaded(exercise, protect = AREA_KEYS) {
  const name = String(exercise?.name || exercise?.exercise_name || '');
  if (!name) return [];
  return protect.filter((a) => AREAS[a] && AREAS[a].test(name));
}

/** Equipment buckets an exercise needs (empty = none listed). */
export function equipmentBuckets(exercise) {
  return [...new Set((exercise?.equipment || []).map(normalizeEquipment).filter(Boolean))];
}

export function isNever(exercise, prefs) {
  const id = exercise?.id ?? exercise?.exercise_id;
  const name = _lc(exercise?.name || exercise?.exercise_name);
  return (prefs?.never || []).some((n) =>
    (n.id != null && id != null && Number(n.id) === Number(id)) || (n.name && _lc(n.name) === name));
}

/** Has the equipment for it? No equipment listed, or no equipment preference, counts as yes. */
export function hasEquipment(exercise, prefs) {
  const have = prefs?.equipment || [];
  if (!have.length) return true;
  const need = equipmentBuckets(exercise);
  if (!need.length) return true;
  if (need.includes('Bodyweight')) return true;
  return need.some((b) => have.includes(b));
}

/** May this exercise be suggested at all? */
export function isAllowed(exercise, prefs) {
  if (!exercise) return false;
  if (isNever(exercise, prefs)) return false;
  if (areasLoaded(exercise, prefs?.protect || []).length) return false;
  return hasEquipment(exercise, prefs);
}

/**
 * Up to `limit` alternatives for `source`, best first, each with the
 * reasons it was picked. Exercises you've done before rank higher
 * (`usage` is GET /api/exercises/usage: { id: { count } }).
 */
export function suggestSwaps(source, library, prefs, { limit = 4, usage = {} } = {}) {
  if (!source) return [];
  const p = cleanPrefs(prefs);
  const pool = findSimilarExercises(source, library || [], 60);
  const sourceAreas = areasLoaded(source, p.protect);
  const sourceEq = equipmentBuckets(source);
  const scored = [];
  pool.forEach((ex, rank) => {
    if (!isAllowed(ex, p)) return;
    const used = Number(usage?.[ex.id]?.count) || 0;
    const reasons = ['same_muscles'];
    if (sourceAreas.length) reasons.push('protects');
    if (p.equipment.length && sourceEq.length && !hasEquipment(source, p)) reasons.push('your_equipment');
    if (used > 0) reasons.push('done_before');
    // Similarity order is the backbone; familiarity is a nudge, not a takeover.
    const score = (pool.length - rank) + Math.min(used, 10) * 1.5;
    scored.push({ exercise: ex, reasons, protects: sourceAreas, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Estimated 1RM of the best completed working set of a session. */
function _bestE1rm(entry) {
  let best = 0, top = null;
  for (const s of entry?.sets || []) {
    if (!s?.completed || s.warmup) continue;
    if (isTimedSet({ set_type: entry?.set_type }, s)) continue;
    const w = Number(s.weight) || 0, r = Number(s.reps) || 0;
    if (w <= 0 || r <= 0) continue;
    const e = r === 1 ? w : w * (1 + r / 30);
    if (e > best) { best = e; top = { weight: w, reps: r }; }
  }
  return { e1rm: best, top };
}

/** Sessions needed to call a lift stalled, by strictness (0 = off). */
export const STALL_SESSIONS = { gentle: 0, balanced: 4, strict: 3 };

/**
 * Stalled lift: across the last N sessions before `before`, the best set
 * never beat the oldest of them. Returns { sessions, top: {weight, reps} } or null.
 */
export function stallCheck(history, { before, strictness = 'balanced' } = {}) {
  const n = STALL_SESSIONS[strictness] ?? STALL_SESSIONS.balanced;
  if (!n) return null;
  const sessions = (history || [])
    .filter((h) => h && typeof h.date === 'string' && (!before || h.date < before))
    .map((h) => ({ date: h.date, ..._bestE1rm(h) }))
    .filter((h) => h.e1rm > 0)
    .slice(0, n);
  if (sessions.length < n) return null;
  const oldest = sessions[sessions.length - 1];
  const newer = sessions.slice(0, -1);
  if (newer.some((s) => s.e1rm > oldest.e1rm + 0.01)) return null;
  const best = sessions.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
  return { sessions: n, top: best.top };
}

/**
 * Major muscle groups with no working sets in the last 7 days (today
 * included). Quiet for new users: needs `minWorkouts` workouts in the window
 * (gentle: never, balanced: 2, strict: 1).
 * Returns [{ group, suggestion: exercise|null }], at most 2.
 */
export function muscleGaps(recentWorkouts, library, prefs, { today, usage = {} } = {}) {
  const p = cleanPrefs(prefs);
  const minWorkouts = { gentle: Infinity, balanced: 2, strict: 1 }[p.strictness];
  if (!Number.isFinite(minWorkouts) || !today) return [];
  const byId = new Map((library || []).map((e) => [Number(e.id), e]));
  const t0 = Date.parse(`${today}T12:00:00Z`);
  const counts = Object.fromEntries(MAJOR_GROUPS.map((g) => [g, 0]));
  let workouts = 0;
  for (const w of recentWorkouts || []) {
    const t = Date.parse(`${w?.date}T12:00:00Z`);
    if (!Number.isFinite(t) || t > t0 || t0 - t >= 7 * 86_400_000) continue;
    let trained = false;
    for (const ex of w.exercises || []) {
      const lib = byId.get(Number(ex.exercise_id));
      const done = (ex.sets || []).filter((s) => s?.completed && !s.warmup).length;
      if (!done) continue;
      trained = true;
      const groups = new Set((lib?.primary_muscles || []).map(normalizeMuscle));
      for (const g of groups) if (g in counts) counts[g] += done;
    }
    if (trained) workouts++;
  }
  if (workouts < minWorkouts) return [];
  const gaps = MAJOR_GROUPS.filter((g) => counts[g] === 0);
  return gaps.slice(0, 2).map((group) => ({ group, suggestion: pickForGroup(group, library, p, usage) }));
}

/** The best allowed exercise for a muscle group: ones you've done first, then compound-looking names. */
export function pickForGroup(group, library, prefs, usage = {}) {
  const p = cleanPrefs(prefs);
  const cands = (library || []).filter((e) =>
    (e.primary_muscles || []).some((m) => normalizeMuscle(m) === group) && isAllowed(e, p));
  if (!cands.length) return null;
  // Compound lifts first (more muscle per set), isolation next; long,
  // oddly specific library names last.
  const score = (e) => (Number(usage?.[e.id]?.count) || 0) * 10
    + (/press|row|squat|deadlift|pull[- ]?up|chin[- ]?up|lunge|thrust|\bdips?\b|push[- ]?up/i.test(e.name) ? 3
      : /curl|raise|fly|extension|kickback/i.test(e.name) ? 1 : 0)
    - (e.name.length > 30 ? 1 : 0);
  return [...cands].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
}

/** One plain-language line for Trace's system prompt. Empty when nothing is set. */
export function promptLine(prefs, areaLabels = {}) {
  const p = cleanPrefs(prefs);
  const parts = [];
  if (p.protect.length) {
    parts.push(`Protect: ${p.protect.map((a) => areaLabels[a] || a.replace('_', ' ')).join(', ')} (avoid exercises that load these hard; offer easier variations).`);
  }
  if (p.never.length) parts.push(`Never suggest: ${p.never.map((n) => n.name).filter(Boolean).join(', ')}.`);
  if (p.equipment.length) parts.push(`Equipment available: ${p.equipment.join(', ')} (bodyweight always fine).`);
  return parts.join(' ');
}
