<script>
  // Fork patch 4: weekly check-in. Last week in one line and one
  // adjustment for this week (planner.js#weeklyCheckin). Shows on today's
  // Diary until "Got it", once per week.
  import { _ } from 'svelte-i18n';
  import { LtApi } from '../../lib/api.js';
  import { getLibrary } from '../../lib/exercise-library.js';
  import { weeklyWorkoutGoal } from '../../stores/settings.js';
  import { weeklyCheckin, weekStart } from '../../lib/planner.js';

  export let today;

  let checkin = null;
  let dismissed = false;
  const key = (d) => `lt:checkinDismissed:${weekStart(d)}`;

  $: load(today, $weeklyWorkoutGoal);
  async function load(d, goal) {
    if (!d) return;
    try { dismissed = !!localStorage.getItem(key(d)); } catch { dismissed = false; }
    if (dismissed) { checkin = null; return; }
    try {
      const [recent, lib] = await Promise.all([LtApi.getRecentWorkouts(30), getLibrary()]);
      checkin = weeklyCheckin(Array.isArray(recent) ? recent : [], lib, { today: d, goal: Number(goal) || 3 });
    } catch { checkin = null; }
  }
  function gotIt() {
    try { localStorage.setItem(key(today), '1'); } catch {}
    dismissed = true;
  }
  function fmtDate(d) {
    const t = Date.parse(`${d}T12:00:00`);
    return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : d;
  }
  const group = (g) => {
    const s = $_(`suggest.groups.${g}`);
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
</script>

{#if checkin && !dismissed}
  <div class="checkin" data-testid="checkin-card">
    <div class="ci-head">
      <span class="material-symbols-rounded" aria-hidden="true">insights</span>
      <span class="ci-title">{$_('checkin.title')}</span>
      <span class="ci-week">{$_('checkin.week_of', { values: { date: fmtDate(checkin.weekOf) } })}</span>
    </div>
    <div class="ci-summary">{$_('checkin.summary', { values: { sessions: checkin.sessions, goal: checkin.goal, sets: checkin.totalSets } })}</div>
    <p class="ci-advice" data-kind={checkin.advice.kind}>
      {#if checkin.advice.kind === 'hold_hard'}{$_('checkin.hold_hard')}
      {:else if checkin.advice.kind === 'consistency'}{$_('checkin.consistency', { values: { sessions: checkin.advice.sessions, goal: checkin.advice.goal } })}
      {:else if checkin.advice.kind === 'too_much'}{$_('checkin.too_much', { values: { sets: checkin.advice.sets, group: $_(`suggest.groups.${checkin.advice.group}`) } })}
      {:else if checkin.advice.kind === 'add_sets'}{$_('checkin.add_sets', { values: { sets: checkin.advice.sets, group: group(checkin.advice.group) } })}
      {:else}{$_('checkin.progress')}{/if}
    </p>
    <button type="button" class="ci-ok" on:click={gotIt}>{$_('checkin.got_it')}</button>
  </div>
{/if}

<style>
  .checkin {
    margin: 0 0 12px; padding: 10px 12px; border-radius: var(--radius, 12px);
    background: color-mix(in srgb, var(--accent) 6%, var(--surface-1, transparent));
    border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .ci-head { display: flex; align-items: center; gap: 6px; }
  .ci-head .material-symbols-rounded { font-size: 18px; color: var(--accent); }
  .ci-title { font-weight: 700; font-size: 13px; color: var(--text-1); }
  .ci-week { margin-left: auto; font-size: 11.5px; color: var(--text-3); }
  .ci-summary { margin-top: 4px; font-size: 12.5px; font-weight: 600; color: var(--text-2); }
  .ci-advice { margin: 6px 0 2px; font-size: 13px; line-height: 1.45; color: var(--text-1); }
  .ci-ok { background: none; border: 0; padding: 4px 0; min-height: 32px; color: var(--accent); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
</style>
