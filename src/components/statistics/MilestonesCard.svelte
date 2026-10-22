<script>
  // Fork patch 5: weekly streak (current / best) and every milestone earned.
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { LtApi } from '../../lib/api.js';
  import { weightUnit, weeklyWorkoutGoal } from '../../stores/settings.js';
  import { weekStreak, totals, earnedMilestones } from '../../lib/engagement.js';
  import { localDateStr } from '../../lib/db.js';

  /** Bound by Statistics so its streak tiles show weeks, not days. */
  export let streak = null;

  let rows = [];
  let loaded = false;
  onMount(async () => {
    try { const r = await LtApi.getRecentWorkouts(2000); rows = Array.isArray(r) ? r : []; } catch { rows = []; }
    loaded = true;
  });

  $: dates = rows.filter(r => (r.exercises || []).some(e => (e.sets || []).some(s => s.completed && !s.warmup))).map(r => r.date);
  $: streak = loaded ? weekStreak(dates, $weeklyWorkoutGoal, localDateStr()) : null;
  $: t = totals(rows);
  $: volumeLbs = $weightUnit === 'kg' ? t.volume * 2.20462 : t.volume;
  $: earned = earnedMilestones({ workouts: t.workouts, longestWeeks: streak?.longest || 0, volumeLbs });
  const icon = (k) => (k === 'workouts' ? 'fitness_center' : k === 'weeks' ? 'local_fire_department' : 'scale');
  function label(m) {
    if (m.kind === 'workouts') return m.value === 1 ? '1st workout' : `${m.value} workouts`;
    if (m.kind === 'weeks') return `${m.value} weeks in a row`;
    const v = $weightUnit === 'kg' ? Math.round(m.value / 2.20462) : m.value;
    return `${v >= 1_000_000 ? (v / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'M' : Math.round(v / 1000) + 'k'} ${$weightUnit}`;
  }
</script>

<div class="ms-card" data-testid="milestones-card">
  <div class="ms-head">
    <h3 class="ms-title">{$_('engage.milestones_title')}</h3>
    {#if streak}
      <span class="ms-streak">{$_('engage.streak_now', { values: { weeks: streak.weeks } })} · {$_('engage.streak_best', { values: { weeks: streak.longest } })}</span>
    {/if}
  </div>
  {#if loaded && !earned.length}
    <p class="ms-empty">{$_('engage.milestones_empty')}</p>
  {:else}
    <div class="ms-list">
      {#each [...earned].reverse() as m (m.kind + m.value)}
        <span class="ms-badge"><span class="material-symbols-rounded" aria-hidden="true">{icon(m.kind)}</span>{label(m)}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ms-card { margin-top: 12px; padding: 14px 16px; border-radius: var(--radius-lg, 14px); background: var(--surface-1); border: 1px solid var(--border); }
  .ms-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .ms-title { margin: 0; font-size: 15px; color: var(--text-1); flex: 1; }
  .ms-streak { font-size: 12px; color: var(--text-3); }
  .ms-empty { margin: 6px 0 0; font-size: 13px; color: var(--text-2); }
  .ms-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .ms-badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent);
    font-size: 12px; font-weight: 600;
  }
  .ms-badge .material-symbols-rounded { font-size: 15px; }
</style>
