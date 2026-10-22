<script>
  // Fork patch 5: last month in numbers, on today's Diary during the first
  // 7 days of a month, until "Nice". Encouraging whichever way it went.
  import { _ } from 'svelte-i18n';
  import { LtApi } from '../../lib/api.js';
  import { weightUnit } from '../../stores/settings.js';
  import { monthlyRecap, previousMonth, compareVolume } from '../../lib/engagement.js';

  export let today;

  let recap = null;
  let dismissed = false;
  const key = (m) => `lt:recapDismissed:${m}`;

  $: load(today);
  async function load(d) {
    recap = null;
    if (!d || Number(d.slice(8, 10)) > 7) return;
    const month = previousMonth(d);
    try { dismissed = !!localStorage.getItem(key(month)); } catch { dismissed = false; }
    if (dismissed) return;
    try {
      const rows = await LtApi.getRecentWorkouts(120);
      recap = monthlyRecap(Array.isArray(rows) ? rows : [], month);
    } catch { recap = null; }
  }
  function ok() {
    try { localStorage.setItem(key(recap.month), '1'); } catch {}
    dismissed = true;
  }
  $: monthName = recap
    ? new Date(`${recap.month}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long' })
    : '';
  $: like = recap ? compareVolume(recap.volume, $weightUnit) : null;
</script>

{#if recap && !dismissed}
  <div class="recap" data-testid="recap-card">
    <div class="rc-head">
      <span class="rc-emoji" aria-hidden="true">📅</span>
      <span class="rc-title">{$_('engage.recap_title', { values: { month: monthName } })}</span>
    </div>
    <div class="rc-line">{$_('engage.recap_line', { values: { workouts: recap.workouts, sets: recap.sets, volume: Math.round(recap.volume).toLocaleString(), unit: $weightUnit } })}</div>
    {#if like}
      <p class="rc-text">{$_('engage.recap_thing', { values: { count: like.count, thing: $_(`engage.things.${like.key}`, { values: { count: like.count } }) } })}</p>
    {/if}
    {#if recap.topExercise}
      <p class="rc-text">{$_('engage.recap_top', { values: { name: recap.topExercise.name, sets: recap.topExercise.sets } })}</p>
    {/if}
    {#if recap.vsPrev != null}
      <p class="rc-text">
        {#if recap.vsPrev > 0}{$_('engage.recap_more', { values: { n: recap.vsPrev } })}
        {:else if recap.vsPrev === 0}{$_('engage.recap_same')}
        {:else}{$_('engage.recap_fewer')}{/if}
      </p>
    {/if}
    <button type="button" class="rc-ok" on:click={ok}>{$_('engage.recap_ok')}</button>
  </div>
{/if}

<style>
  .recap {
    margin: 0 0 12px; padding: 10px 12px; border-radius: var(--radius, 12px);
    background: color-mix(in srgb, var(--accent) 6%, var(--surface-1, transparent));
    border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .rc-head { display: flex; align-items: center; gap: 6px; }
  .rc-emoji { font-size: 16px; }
  .rc-title { font-weight: 700; font-size: 13px; color: var(--text-1); }
  .rc-line { margin-top: 4px; font-size: 12.5px; font-weight: 600; color: var(--text-2); }
  .rc-text { margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: var(--text-1); }
  .rc-ok { background: none; border: 0; padding: 4px 0; min-height: 32px; color: var(--accent); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
</style>
