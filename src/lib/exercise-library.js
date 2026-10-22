/**
 * Fork: one cached copy of the exercise library + usage counts for the
 * suggestion engine, so every exercise card doesn't refetch ~1,500 rows.
 * Refreshed after 5 minutes, or on demand with { fresh: true }.
 */
import { LtApi } from './api.js';

const TTL = 5 * 60 * 1000;
let _lib = null, _libAt = 0, _libP = null;
let _usage = null, _usageAt = 0, _usageP = null;

export async function getLibrary({ fresh = false } = {}) {
  if (!fresh && _lib && Date.now() - _libAt < TTL) return _lib;
  if (!_libP) {
    _libP = LtApi.getExercises()
      .then((rows) => { _lib = Array.isArray(rows) ? rows : []; _libAt = Date.now(); return _lib; })
      .catch(() => _lib || [])
      .finally(() => { _libP = null; });
  }
  return _libP;
}

export async function getUsage({ fresh = false } = {}) {
  if (!fresh && _usage && Date.now() - _usageAt < TTL) return _usage;
  if (!_usageP) {
    _usageP = Promise.resolve(LtApi.getExerciseUsage ? LtApi.getExerciseUsage() : {})
      .then((u) => { _usage = u && typeof u === 'object' ? u : {}; _usageAt = Date.now(); return _usage; })
      .catch(() => _usage || {})
      .finally(() => { _usageP = null; });
  }
  return _usageP;
}

/** Look one exercise up by id in the cached library (loads it if needed). */
export async function libraryExercise(id) {
  if (id == null) return null;
  const lib = await getLibrary();
  return lib.find((e) => Number(e.id) === Number(id)) || null;
}
