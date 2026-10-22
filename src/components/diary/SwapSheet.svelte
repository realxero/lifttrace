<script>
  // Fork patch 3: "Suggest a swap". Ranked alternatives for one exercise,
  // filtered by the suggestion settings (protected areas, never-suggest,
  // equipment). Works even when proactive suggestions are off.
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';
  import Sheet from '../ui/Sheet.svelte';
  import { suggestionPrefs } from '../../stores/settings.js';
  import { suggestSwaps, cleanPrefs } from '../../lib/suggestions.js';
  import { getLibrary, getUsage } from '../../lib/exercise-library.js';
  import { showSuccess } from '../../stores/toast.js';

  export let open = false;
  /** The diary exercise entry: { exercise_id, exercise_name }. */
  export let source = null;

  const dispatch = createEventDispatcher();
  let loading = false;
  let swaps = [];
  let _for = null;

  $: prefs = cleanPrefs($suggestionPrefs || {});
  $: if (open && source) load(source, prefs);

  async function load(src, p) {
    const key = `${src.exercise_id}|${src.exercise_name}|${JSON.stringify(p)}`;
    if (key === _for) return;
    _for = key;
    loading = true;
    try {
      const [lib, usage] = await Promise.all([getLibrary(), getUsage()]);
      if (key !== _for) return;
      const row = lib.find((e) => src.exercise_id != null && Number(e.id) === Number(src.exercise_id))
        || lib.find((e) => e.name?.toLowerCase() === String(src.exercise_name || '').toLowerCase());
      swaps = row ? suggestSwaps(row, lib, p, { limit: 5, usage }) : [];
    } catch {
      swaps = [];
    } finally {
      if (key === _for) loading = false;
    }
  }

  function areaLabels(areas) {
    return areas.map((a) => $_(`suggest.areas.${a}`)).join(', ');
  }

  function use(ex) {
    dispatch('use', ex);
    open = false;
    _for = null;
  }

  function never(ex) {
    const cur = cleanPrefs($suggestionPrefs || {});
    if (!cur.never.some((n) => Number(n.id) === Number(ex.id))) {
      suggestionPrefs.set({ ...cur, never: [...cur.never, { id: ex.id, name: ex.name }] });
    }
    showSuccess($_('suggest.never_toast', { values: { name: ex.name } }));
  }

  function close() { open = false; _for = null; dispatch('close'); }
</script>

<Sheet bind:open title={source ? $_('suggest.swap_title', { values: { name: source.exercise_name } }) : ''} on:close={close}>
  <div class="swap" data-testid="swap-sheet">
    {#if loading}
      <p class="swap-empty">{$_('suggest.swap_loading')}</p>
    {:else if !swaps.length}
      <p class="swap-empty">{$_('suggest.swap_none')}</p>
    {:else}
      {#each swaps as s (s.exercise.id)}
        <div class="swap-row">
          <div class="swap-info">
            <div class="swap-name">{s.exercise.name}</div>
            <div class="swap-reasons">
              {#each s.reasons as r}
                <span class="swap-reason" class:good={r === 'protects'}>
                  {r === 'protects'
                    ? $_('suggest.reason_protects', { values: { areas: areaLabels(s.protects) } })
                    : $_(`suggest.reason_${r}`)}
                </span>
              {/each}
            </div>
          </div>
          <div class="swap-actions">
            <button type="button" class="btn btn-primary swap-use" on:click={() => use(s.exercise)}>{$_('suggest.swap_use')}</button>
            <button type="button" class="swap-never" on:click={() => never(s.exercise)}>{$_('suggest.swap_never')}</button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</Sheet>

<style>
  .swap { display: flex; flex-direction: column; gap: 8px; padding: 4px 16px 16px; }
  .swap-empty { color: var(--text-2); font-size: 14px; line-height: 1.45; margin: 8px 0; }
  .swap-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: var(--radius-sm);
    background: var(--surface-2, color-mix(in srgb, var(--text-3) 8%, transparent));
  }
  .swap-info { flex: 1; min-width: 0; }
  .swap-name { font-weight: 600; color: var(--text-1); overflow-wrap: anywhere; }
  .swap-reasons { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .swap-reason {
    font-size: 11px; color: var(--text-2); padding: 1px 7px; border-radius: 999px;
    background: color-mix(in srgb, var(--text-3) 12%, transparent);
  }
  .swap-reason.good { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .swap-actions { display: flex; flex-direction: column; align-items: stretch; gap: 2px; flex-shrink: 0; }
  .swap-use { min-height: 36px; padding: 0 16px; }
  .swap-never {
    background: none; border: 0; color: var(--text-3); font: inherit; font-size: 11px;
    padding: 4px 0; min-height: 28px; cursor: pointer;
  }
</style>
