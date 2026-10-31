<script lang="ts">
  import { ASSUMPTIONS_BP, futureValue } from '#lib/engine/compound.ts';
  import { formatEuros, parseEuros } from '#lib/engine/money.ts';
  import { FOLLOWS_SCENARIO, FREQUENCY_LABEL, TYPE_LABEL } from '#lib/labels.ts';
  import type { PageProps } from './$types';

  let { data, form }: Pick<PageProps, 'data' | 'form'> = $props();

  type Type = keyof typeof TYPE_LABEL;
  type Frequency = keyof typeof FREQUENCY_LABEL;

  // Kit types the failure payload loosely; these are what the action returns.
  const values = $derived((form?.values ?? {}) as Record<string, string | undefined>);
  const errors = $derived((form?.errors ?? {}) as Record<string, string | undefined>);

  // Templates (from the approved screen): switching type on a new rule fills these in.
  const TEMPLATES: Record<Type, { name: string; euros: number }> = {
    entra: { name: 'Nómina', euros: 1400 },
    sale: { name: 'Gastos fijos', euros: 650 },
    mueve: { name: 'Aportación al fondo indexado', euros: 300 },
  };
  const first = (kinds: string[]) => data.accounts.find((a) => kinds.includes(a.kind))?.id ?? '';
  const CASH = ['efectivo', 'remunerada'];

  // The form starts from the stored rule, or from what was sent when it failed validation.
  // svelte-ignore state_referenced_locally
  const r = data.rule;
  // svelte-ignore state_referenced_locally
  const v = values;
  let type = $state<Type>((v.type as Type) ?? r?.type ?? 'mueve');
  let name = $state(v.name ?? r?.name ?? TEMPLATES.mueve.name);
  let amount = $state(
    v.amount ?? (r ? String(r.amountCents / 100).replace('.', ',') : String(TEMPLATES.mueve.euros)),
  );
  let frequency = $state<Frequency>((v.frequency as Frequency) ?? r?.frequency ?? 'mensual');
  let from = $state(v.from ?? r?.fromAccountId ?? first(CASH));
  let to = $state(v.to ?? r?.toAccountId ?? first(FOLLOWS_SCENARIO));
  let touched = $state(!!r || !!v.type);
  // Folded under «Más opciones»: today, from this month, no end.
  // svelte-ignore state_referenced_locally
  let day = $state(v.day ?? String(r?.day ?? data.today));
  // Bound, not set from errors: an `open={…}` is re-applied whenever the summary text changes.
  // svelte-ignore state_referenced_locally
  let showMore = $state(!!(errors.day || errors.startMonth || errors.endMonth));
  // svelte-ignore state_referenced_locally
  let startMonth = $state(v.startMonth ?? r?.startMonth ?? data.month);
  let endMonth = $state(v.endMonth ?? r?.endMonth ?? '');
  const once = $derived(frequency === 'una_vez');
  const monthName = (m: string) =>
    new Date(`${m}-15`).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
  const when = $derived(
    !/^\d{4}-\d{2}$/.test(startMonth)
      ? ''
      : once
        ? monthName(startMonth)
        : `Día ${day} · desde ${monthName(startMonth)}${endMonth ? ` · hasta ${monthName(endMonth)}` : ' · sin fin'}`,
  );

  function pick(t: Type) {
    type = t;
    if (touched) return;
    name = TEMPLATES[t].name;
    amount = String(TEMPLATES[t].euros);
    if (t === 'entra') to = first(CASH);
    if (t === 'mueve') to = first(FOLLOWS_SCENARIO) || to;
  }

  const cents = $derived(parseEuros(amount) ?? 0);
  const PER_MONTH: Record<Frequency, number> = { mensual: 1, trimestral: 3, anual: 12, una_vez: 0 };
  const monthly = $derived(PER_MONTH[frequency] ? cents / PER_MONTH[frequency] : 0);
  const toInvested = $derived(
    FOLLOWS_SCENARIO.includes(data.accounts.find((a) => a.id === to)?.kind ?? ''),
  );
  const growth = (start: number, perMonth: number) =>
    futureValue({ startCents: start, monthlyCents: perMonth, months: 120 }, ASSUMPTIONS_BP.base) -
    start -
    perMonth * 120;

  const impact = $derived.by(() => {
    if (type === 'entra')
      return once
        ? {
            label: 'Entra en tu patrimonio',
            value: `+${formatEuros(cents, { withCents: true })}`,
            note: '',
          }
        : {
            label: 'Entra en tu patrimonio en 10 años',
            value: `+${formatEuros(monthly * 120)}`,
            note: 'Antes de gastos y de otras reglas.',
          };
    if (type === 'sale')
      return once
        ? {
            label: 'Sale de tu patrimonio',
            value: `−${formatEuros(cents, { withCents: true })}`,
            note: '',
          }
        : {
            label: 'Sale de tu capacidad de ahorro',
            value: `−${formatEuros(monthly)} al mes`,
            note: 'La proyección ya lo descuenta.',
          };
    if (!toInvested)
      return {
        label: 'Pasa de una cuenta a otra',
        value: 'Tu patrimonio no cambia',
        note: 'Solo cambia dónde está el dinero.',
      };
    return {
      label: 'Lo que puede añadir la rentabilidad en 10 años',
      value: `+${formatEuros(once ? growth(cents, 0) : growth(0, monthly))}`,
      note: `Pones ${formatEuros(once ? cents : monthly * 120)}. Escenario base, en euros de hoy. Estimación, no asesoramiento.`,
    };
  });
</script>

<svelte:head>
  <title>{r ? 'Editar regla' : 'Nueva regla'} · Soleva</title>
</svelte:head>

{#snippet error(field: string)}
  {#if errors[field]}<span class="err" id="{field}-error">{errors[field]}</span>{/if}
{/snippet}

<div class="backdrop" aria-hidden="true"></div>
<div class="sv-sheet sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
  <span class="sv-sheet__handle" aria-hidden="true"></span>
  <header>
    <a href="/reglas" class="cancel">Cancelar</a>
    <h1 id="sheet-title">{r ? 'Editar regla' : 'Nueva regla'}</h1>
    <span class="spacer"></span>
  </header>

  <form method="POST" action="?/guardar" novalidate>
    <input type="hidden" name="active" value={String(r?.active ?? true)} />

    <div class="sv-seg types f1" role="radiogroup" aria-label="Tipo de regla">
      {#each Object.entries(TYPE_LABEL) as [t, label] (t)}
        <label class="sv-seg__item" aria-pressed={type === t}>
          <input
            type="radio"
            name="type"
            value={t}
            checked={type === t}
            onchange={() => pick(t as Type)}
          />{label}
        </label>
      {/each}
    </div>

    <label class="sv-field f2">
      <span class="sv-field__label">Nombre</span>
      <span class="sv-field__box">
        <input
          class="sv-field__input name"
          name="name"
          maxlength="60"
          bind:value={name}
          oninput={() => (touched = true)}
          aria-invalid={!!errors.name}
        />
      </span>
      {@render error('name')}
    </label>

    <div class="amount f2">
      <label class="amount__top">
        <span class="sv-field__label">Importe</span>
        <span class="amount__value">
          <input
            name="amount"
            inputmode="decimal"
            autocomplete="off"
            bind:value={amount}
            oninput={() => (touched = true)}
            aria-invalid={!!errors.amount}
            aria-describedby={errors.amount ? 'amount-error' : undefined}
          />
          <span>€</span>
        </span>
      </label>
      <input
        class="sv-range"
        type="range"
        min="25"
        max="2000"
        step="25"
        aria-label="Ajustar importe"
        value={Math.min(2000, Math.max(25, cents / 100))}
        oninput={(e) => {
          amount = e.currentTarget.value;
          touched = true;
        }}
      />
      {@render error('amount')}
    </div>

    <div class="f3 group">
      <span class="sv-field__label" id="freq-label">Cada cuánto</span>
      <div class="chips" role="radiogroup" aria-labelledby="freq-label">
        {#each Object.entries(FREQUENCY_LABEL) as [f, label] (f)}
          <label class="chip" aria-pressed={frequency === f}>
            <input type="radio" name="frequency" value={f} bind:group={frequency} />{label}
          </label>
        {/each}
      </div>
    </div>

    <details class="f3 more" bind:open={showMore}>
      <summary>
        <span>Más opciones</span>
        <span class="more__now">{when}</span>
      </summary>
      <div class="when">
        {#if !once}
          <label class="sv-field">
            <span class="sv-field__label">Día</span>
            <span class="sv-field__box">
              <input
                class="sv-field__input"
                name="day"
                type="number"
                min="1"
                max="31"
                bind:value={day}
                aria-invalid={!!errors.day}
              />
            </span>
            {@render error('day')}
          </label>
        {:else}
          <input type="hidden" name="day" value={day} />
        {/if}
        <label class="sv-field">
          <span class="sv-field__label">{once ? 'Cuándo' : 'Desde'}</span>
          <span class="sv-field__box">
            <input
              class="sv-field__input"
              name="startMonth"
              type="month"
              bind:value={startMonth}
              aria-invalid={!!errors.startMonth}
            />
          </span>
          {@render error('startMonth')}
        </label>
        {#if !once}
          <label class="sv-field">
            <span class="sv-field__label">Hasta <span class="sv-subtle">(opcional)</span></span>
            <span class="sv-field__box">
              <input
                class="sv-field__input"
                name="endMonth"
                type="month"
                bind:value={endMonth}
                aria-invalid={!!errors.endMonth}
              />
            </span>
            {@render error('endMonth')}
          </label>
        {/if}
      </div>
    </details>

    <div class="flow f3">
      {#if type !== 'entra'}
        <label class="side">
          <span class="side__label">Desde</span>
          <select name="from" bind:value={from} aria-invalid={!!errors.from}>
            <option value="" disabled>Elige cuenta</option>
            {#each data.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
          </select>
          {@render error('from')}
        </label>
      {:else}
        <span class="side"
          ><span class="side__label">Desde</span><span>Fuera de tus cuentas</span></span
        >
      {/if}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg
      >
      {#if type !== 'sale'}
        <label class="side side--end">
          <span class="side__label">A</span>
          <select name="to" bind:value={to} aria-invalid={!!errors.to}>
            <option value="" disabled>Elige cuenta</option>
            {#each data.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
          </select>
          {@render error('to')}
        </label>
      {:else}
        <span class="side side--end"><span class="side__label">Para</span><span>Gastos</span></span>
      {/if}
    </div>

    <div class="impact f4" aria-live="polite">
      <span class="sv-field__label">{impact.label}</span>
      <span class="impact__value">{impact.value}</span>
      {#if impact.note}<span class="impact__note">{impact.note}</span>{/if}
    </div>

    <div class="actions">
      <button class="sv-btn sv-btn--accent create">{r ? 'Guardar' : 'Crear regla'}</button>
      <p class="sv-legal">Soleva no mueve dinero: solo apunta lo que tú haces.</p>
    </div>
  </form>

  {#if r}
    <form
      method="POST"
      action="?/borrar"
      class="delete"
      onsubmit={(e) => {
        if (!confirm('¿Borrar esta regla? No se puede deshacer.')) e.preventDefault();
      }}
    >
      <button class="sv-btn sv-btn--ghost sv-btn--sm">Borrar regla</button>
    </form>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: rgba(0, 0, 0, 0.6);
  }
  .sheet {
    position: fixed;
    z-index: 11;
    inset: 18px 0 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    animation: sheet 0.7s var(--ease-out) both;
  }
  @media (min-width: 640px) {
    .sheet {
      inset: 5vh 0 0;
      width: 480px;
      margin: 0 auto;
    }
  }
  @keyframes sheet {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
  }
  .f1,
  .f2,
  .f3,
  .f4 {
    animation: sv-fade-up 0.7s var(--ease-out) both;
  }
  .f1 {
    animation-delay: 0.15s;
  }
  .f2 {
    animation-delay: 0.22s;
  }
  .f3 {
    animation-delay: 0.29s;
  }
  .f4 {
    animation-delay: 0.36s;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .cancel {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-size: 15px;
    color: var(--ink-muted);
    text-decoration: none;
  }
  h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  .spacer {
    width: 64px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 18px;
    flex: 1 1 auto;
  }
  input[type='radio'] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .types {
    display: flex;
  }
  .types .sv-seg__item {
    flex: 1 1 0;
    height: 38px;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sv-seg__item:has(:focus-visible),
  .chip:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .name {
    font-size: 16px;
    font-weight: 400;
  }
  .amount {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .amount__top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .amount__value {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.035em;
  }
  .amount__value input {
    width: 7ch;
    text-align: right;
    border: 0;
    border-bottom: 1px solid transparent;
    background: transparent;
    color: var(--ink);
    font: inherit;
    letter-spacing: inherit;
    font-variant-numeric: tabular-nums;
    outline: none;
  }
  .amount__value input:focus {
    border-bottom-color: var(--accent);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    position: relative;
    height: 38px;
    padding: 0 16px;
    border-radius: var(--radius-pill);
    display: inline-flex;
    align-items: center;
    font-size: 14px;
    color: var(--ink-muted);
    box-shadow: inset 0 0 0 1px var(--hairline);
    cursor: pointer;
  }
  .chip[aria-pressed='true'],
  .chip:has(:checked) {
    background: var(--ink);
    color: var(--bg);
    font-weight: 600;
  }
  .types .sv-seg__item:has(:checked) {
    background: var(--ink);
    color: var(--bg);
    font-weight: 600;
  }
  .more summary {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 44px;
    align-items: center;
    font-size: 14px;
    color: var(--ink-muted);
    cursor: pointer;
    list-style: none;
    white-space: nowrap;
  }
  .more summary::-webkit-details-marker {
    display: none;
  }
  .more summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .more__now {
    color: var(--ink);
    text-align: right;
  }
  .more[open] .more__now {
    display: none;
  }
  .when {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    gap: var(--space-3);
  }
  .when .sv-field__box {
    min-width: 0;
  }
  .when input {
    width: 100%;
  }
  .when .sv-field__input {
    font-size: 15px;
    color-scheme: dark;
  }
  .flow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 0;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
    color: var(--accent);
  }
  .side {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
  }
  .side--end {
    text-align: right;
  }
  .side__label {
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-muted);
  }
  select {
    min-height: 32px;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
    text-overflow: ellipsis;
  }
  .side--end select {
    text-align: right;
    text-align-last: right;
  }
  option {
    background: var(--bg);
    color: var(--ink);
  }
  .impact {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 0;
  }
  .impact__value {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .impact__note {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .actions {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .create {
    height: 52px;
  }
  .actions p {
    margin: 0;
    text-align: center;
  }
  .err {
    font-size: 13px;
    color: var(--negative);
  }
  .delete {
    flex: 0 0 auto;
    align-items: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .f1,
    .f2,
    .f3,
    .f4 {
      animation: none;
    }
  }
</style>
