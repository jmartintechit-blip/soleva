<script lang="ts">
  import { DEFAULT_RATE_BP } from '#lib/engine/rules.ts';
  import { FOLLOWS_SCENARIO, KIND_LABEL, RATE_LABEL } from '#lib/labels.ts';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const a = $derived(data.account);
  // Kit types the failure payload loosely; these are what the action returns.
  const values = $derived((form?.values ?? {}) as Record<string, string | undefined>);
  const errors = $derived((form?.errors ?? {}) as Record<string, string | undefined>);
  // Spanish decimals for the inputs: 125050 → "1250,50", 600 → "6".
  const decimal = (n: number) => (n / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');

  // svelte-ignore state_referenced_locally
  let kind = $state(values.kind ?? a?.kind ?? 'efectivo');
  const hasRate = $derived(!FOLLOWS_SCENARIO.includes(kind));
  const defaultRate = $derived(
    ((DEFAULT_RATE_BP[kind as keyof typeof DEFAULT_RATE_BP] ?? 0) / 100)
      .toString()
      .replace('.', ','),
  );
</script>

<svelte:head>
  <title>{a ? a.name : 'Nueva cuenta'} · Soleva</title>
</svelte:head>

<a class="back sv-muted" href="/cuentas">Cuentas</a>
<h1 class="title-lg">{a ? 'Editar cuenta' : 'Nueva cuenta'}</h1>

<form method="POST" action="?/guardar" class="sv-enter" novalidate>
  {#snippet error(field: string)}
    {#if errors[field]}<span class="err" id="{field}-error">{errors[field]}</span>{/if}
  {/snippet}

  <label class="sv-field">
    <span class="sv-field__label">Nombre</span>
    <span class="sv-field__box">
      <input
        class="sv-field__input"
        name="name"
        maxlength="60"
        required
        value={values.name ?? a?.name ?? ''}
        aria-invalid={!!errors.name}
        aria-describedby={errors.name ? 'name-error' : undefined}
      />
    </span>
    {@render error('name')}
  </label>

  <label class="sv-field">
    <span class="sv-field__label">Tipo</span>
    <span class="sv-field__box">
      <select class="sv-field__input" name="kind" bind:value={kind}>
        {#each Object.entries(KIND_LABEL) as [value, label] (value)}
          <option {value}>{label}</option>
        {/each}
      </select>
    </span>
    {@render error('kind')}
  </label>

  <label class="sv-field">
    <span class="sv-field__label"
      >{kind === 'deuda' ? 'Lo que debes hoy' : 'Saldo o valor hoy'}</span
    >
    <span class="sv-field__box">
      <input
        class="sv-field__input"
        name="balance"
        inputmode="decimal"
        autocomplete="off"
        placeholder="0"
        value={values.balance ?? (a ? decimal(a.balanceCents) : '')}
        aria-invalid={!!errors.balance}
        aria-describedby={errors.balance ? 'balance-error' : undefined}
      />
      <span class="sv-field__suffix">€</span>
    </span>
    {@render error('balance')}
  </label>

  {#if hasRate}
    <label class="sv-field">
      <span class="sv-field__label">{RATE_LABEL[kind] ?? 'Interés o remuneración anual'}</span>
      <span class="sv-field__box">
        <input
          class="sv-field__input"
          name="rate"
          inputmode="decimal"
          autocomplete="off"
          placeholder={defaultRate}
          value={values.rate ?? (a ? decimal(a.annualRateBp) : '')}
          aria-invalid={!!errors.rate}
          aria-describedby="rate-hint"
        />
        <span class="sv-field__suffix">%</span>
      </span>
      {@render error('rate')}
      <span class="sv-field__hint" id="rate-hint">
        {kind === 'vehiculo' ? 'En negativo si pierde valor. Vacío: −15 % al año.' : 'Vacío: 0 %.'}
      </span>
    </label>
  {:else}
    <p class="sv-field__hint">
      Crece con la rentabilidad del escenario que elijas en la proyección.
    </p>
  {/if}

  <label class="check">
    <input type="checkbox" name="isEstimated" checked={a?.isEstimated ?? false} />
    <span>Es un valor estimado <span class="sv-muted">(un piso, un coche…)</span></span>
  </label>

  <button class="sv-btn sv-btn--accent">{a ? 'Guardar' : 'Crear cuenta'}</button>
</form>

{#if a}
  <div class="danger">
    <form method="POST" action="?/archivar">
      <input type="hidden" name="archived" value={String(!a.archived)} />
      <button class="sv-btn sv-btn--ghost sv-btn--sm"
        >{a.archived ? 'Recuperar' : 'Archivar'}</button
      >
    </form>
    <form
      method="POST"
      action="?/borrar"
      onsubmit={(e) => {
        if (!confirm('¿Borrar esta cuenta y sus reglas? No se puede deshacer.')) e.preventDefault();
      }}
    >
      <button class="sv-btn sv-btn--ghost sv-btn--sm">Borrar</button>
    </form>
    <p class="sv-field__hint">
      Archivar la saca del patrimonio y de la proyección sin perder nada.
    </p>
  </div>
{/if}

<style>
  .back {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    font-size: 15px;
    text-decoration: none;
  }
  h1 {
    margin: 0 0 var(--space-6);
  }
  form,
  .danger {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-width: 480px;
  }
  select {
    appearance: none;
    cursor: pointer;
  }
  option {
    background: var(--bg);
    color: var(--ink);
  }
  .err {
    font-size: 13px;
    color: var(--negative);
  }
  .check {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    min-height: 44px;
    font-size: 15px;
  }
  .check input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
  .sv-btn--accent {
    align-self: flex-start;
  }
  .danger {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-7);
    padding-top: var(--space-5);
    border-top: 1px solid var(--hairline);
  }
  .danger form {
    display: contents;
  }
  .danger p {
    flex-basis: 100%;
    margin: 0;
  }
</style>
