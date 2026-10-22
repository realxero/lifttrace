<script>
  // Fork patch 4: "Your week". Lays the active program's workouts over the
  // days you train (planner.js#planWeek), with a one-tap start for today.
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';
  import Sheet from '../ui/Sheet.svelte';
  import { LtApi } from '../../lib/api.js';
  import { trainingDays } from '../../stores/settings.js';
  import { activeProgram, loadActiveProgram } from '../../stores/workout.js';
  import { showSuccess, showError } from '../../stores/toast.js';
  import { planWeek, recommendStarter, WEEKDAYS } from '../../lib/planner.js';

  /** Today's date (YYYY-MM-DD) and whether today's diary already has exercises. */
  export let today;
  export let hasExercises = false;
  /** Bump to reload after a workout is saved. */
  export let refreshKey = 0;

  const dispatch = createEventDispatcher();
  let program = null;
  let recent = [];
  let plan = [];
  let sheetOpen = false;
  let draft = [];
  let programs = [];

  $: days = Array.isArray($trainingDays) ? $trainingDays : [];
  $: load($activeProgram?.id ?? null, refreshKey, today);

  async function load(programId) {
    try {
      const [p, r] = await Promise.all([
        programId ? LtApi.getProgram(programId).catch(() => null) : Promise.resolve(null),
        LtApi.getRecentWorkouts(30).catch(() => []),
      ]);
      program = p;
      recent = Array.isArray(r) ? r : [];
    } catch { /* keep what we had */ }
  }

  $: plan = planWeek({ templates: program?.templates || [], trainingDays: days, today, recent });
  $: todayPlan = plan[0];
  $: nextTrain = plan.slice(1).find((d) => d.kind === 'train' && d.template);

  const dayName = (wd) => $_(`plan.days_short.${wd}`);
  // Chip labels: drop the words every workout in the program shares
  // ("Workout A" / "Workout B" → "A" / "B"), then keep it short.
  $: _prefix = (() => {
    const names = (program?.templates || []).map((t) => String(t.name || '').split(/\s+/));
    if (names.length < 2) return 0;
    let n = 0;
    while (names.every((w) => w.length > n + 1 && w[n] === names[0][n])) n++;
    return n;
  })();
  function shortName(t) {
    const words = String(t?.name || '').split(/\s+/).slice(_prefix);
    const n = words.join(' ');
    return n.length > 8 ? n.slice(0, 7) + '…' : n;
  }

  async function openSheet() {
    draft = [...days];
    sheetOpen = true;
    try { programs = await LtApi.getPrograms(); } catch { programs = []; }
  }
  function toggleDay(wd) { draft = draft.includes(wd) ? draft.filter((d) => d !== wd) : [...draft, wd]; }
  function save() { trainingDays.set([...draft].sort()); sheetOpen = false; }

  $: starterName = recommendStarter(draft.length);
  $: starter = programs.find((p) => p.name === starterName) || null;
  async function useStarter() {
    if (!starter) return;
    try {
      await LtApi.setActiveProgram(starter.id);
      await loadActiveProgram();
      showSuccess($_('plan.starter_on', { values: { name: starter.name } }));
    } catch (e) { showError(e.message); }
  }

  function start() {
    if (todayPlan?.template && program) dispatch('start', { template: todayPlan.template, program });
  }
</script>

<div class="plan-card" data-testid="week-plan">
  <div class="plan-head">
    <span class="material-symbols-rounded" aria-hidden="true">event_available</span>
    <span class="plan-title">{$_('plan.title')}</span>
    {#if days.length}
      <button type="button" class="plan-link" on:click={openSheet}>{$_('plan.edit')}</button>
    {/if}
  </div>

  {#if !days.length}
    <p class="plan-text">{$_('plan.pick_prompt')}</p>
    <button type="button" class="plan-btn" on:click={openSheet}>{$_('plan.pick_days')}</button>
  {:else}
    <div class="plan-strip" role="list">
      {#each plan as d, i (d.date)}
        <div class="plan-day" role="listitem" class:today={i === 0} class:rest={d.kind === 'rest'} class:done={d.kind === 'done'}
          title={d.template?.name || ''}>
          <span class="pd-day">{dayName(d.weekday)}</span>
          <span class="pd-what">
            {#if d.kind === 'done'}<span class="material-symbols-rounded" aria-label={$_('plan.done')}>check</span>
            {:else if d.kind === 'rest'}{$_('plan.rest')}
            {:else}{d.template ? shortName(d.template) : $_('plan.train')}{/if}
          </span>
        </div>
      {/each}
    </div>
    <div class="plan-today">
      {#if todayPlan?.kind === 'done'}
        <span class="plan-text">{$_('plan.today_done')}</span>
      {:else if todayPlan?.kind === 'rest'}
        <span class="plan-text">{$_('plan.today_rest')}</span>
      {:else if todayPlan?.template && !hasExercises}
        <button type="button" class="plan-btn" on:click={start}>
          <span class="material-symbols-rounded" aria-hidden="true">play_arrow</span>
          {$_('plan.today_start', { values: { name: todayPlan.template.name } })}
        </button>
      {:else if !todayPlan?.template && !hasExercises}
        <span class="plan-text">{$_('plan.today_free')}</span>
      {/if}
      {#if nextTrain && todayPlan?.kind !== 'train'}
        <span class="plan-next">{$_('plan.next', { values: { name: nextTrain.template.name, day: dayName(nextTrain.weekday) } })}</span>
      {/if}
    </div>
  {/if}
</div>

<Sheet bind:open={sheetOpen} title={$_('plan.sheet_title')}>
  <div class="plan-sheet" data-testid="week-plan-sheet">
    <p class="plan-text">{$_('plan.sheet_hint')}</p>
    <div class="day-chips">
      {#each WEEKDAYS as wd}
        <button type="button" class="day-chip" class:on={draft.includes(wd)} aria-pressed={draft.includes(wd)}
          on:click={() => toggleDay(wd)}>{dayName(wd)}</button>
      {/each}
    </div>
    {#if !$activeProgram && draft.length && starter}
      <div class="starter">
        <p class="plan-text">{$_('plan.starter_hint', { values: { count: draft.length, name: starter.name } })}</p>
        <button type="button" class="plan-btn ghost" on:click={useStarter}>{$_('plan.starter_use', { values: { name: starter.name } })}</button>
      </div>
    {/if}
    <button type="button" class="btn btn-primary plan-save" on:click={save}>{$_('plan.save')}</button>
  </div>
</Sheet>

<style>
  .plan-card {
    margin: 0 0 12px; padding: 10px 12px; border-radius: var(--radius, 12px);
    background: var(--surface-1, transparent); border: 1px solid var(--border);
  }
  .plan-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .plan-head .material-symbols-rounded { font-size: 18px; color: var(--accent); }
  .plan-title { flex: 1; font-weight: 700; font-size: 13px; color: var(--text-1); }
  .plan-link { background: none; border: 0; color: var(--accent); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; min-height: 32px; }
  .plan-text { margin: 0; font-size: 13px; color: var(--text-2); line-height: 1.4; }
  .plan-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .plan-day {
    display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px;
    border-radius: 10px; background: color-mix(in srgb, var(--accent) 8%, transparent); min-width: 0;
  }
  .plan-day.rest { background: color-mix(in srgb, var(--text-3) 8%, transparent); }
  .plan-day.done { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .plan-day.today { outline: 2px solid var(--accent); outline-offset: -2px; }
  .pd-day { font-size: 10.5px; font-weight: 700; color: var(--text-3); text-transform: uppercase; }
  .pd-what { font-size: 11px; color: var(--text-1); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plan-day.rest .pd-what { color: var(--text-3); }
  .pd-what .material-symbols-rounded { font-size: 16px; color: var(--accent); }
  .plan-today { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
  .plan-next { font-size: 12px; color: var(--text-3); }
  .plan-btn {
    display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 14px; margin-top: 4px;
    border-radius: 999px; border: 0; background: var(--accent); color: #fff;
    font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; max-width: 100%;
  }
  .plan-btn.ghost { background: none; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); }
  .plan-btn .material-symbols-rounded { font-size: 18px; }
  .plan-sheet { display: flex; flex-direction: column; gap: 12px; padding: 4px 16px 16px; }
  .day-chips { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
  .day-chip {
    min-height: 44px; border-radius: 12px; border: 1px solid var(--border); background: none;
    color: var(--text-2); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .day-chip.on { border-color: var(--accent); background: var(--accent); color: #fff; }
  .starter { display: flex; flex-direction: column; gap: 6px; }
  .plan-save { min-height: 44px; }
</style>
