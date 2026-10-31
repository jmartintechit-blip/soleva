<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { formatEuros } from '#lib/engine/money.ts';
  import type { PageProps } from './$types';

  // b12/RRemunerada: the bank's terms, copied as they are, and this period's interest on the
  // balance of each day: gross, withheld and net, with the day it is paid.
  let { data, form }: PageProps = $props();

  const eur = (cents: number) => formatEuros(cents, { withCents: true });
  const pct = (bp: number) => (bp / 100).toLocaleString('es-ES', { maximumFractionDigits: 3 });
  const plain = (cents: number) => eur(cents).replace(' €', '');
  const date = (d: string, year = false) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  const month = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' });

  const v = $derived(data.view);
  const sent = untrack(() => (form && 'values' in form ? form.values : null));
  const t0 = untrack(() => data.view.terms);
  let tiers = $state(
    sent?.tiers ??
      t0.tiers.map((x) => ({ upTo: x.upToCents ? plain(x.upToCents) : '', rate: pct(x.rateBp) })),
  );
  let promo = $state(sent ? !!sent.promo : !!t0.promoUntil);
  let promoUntil = $state(sent?.promoUntil ?? t0.promoUntil ?? '');
  let afterRate = $state(sent?.afterRate ?? (t0.afterRateBp !== null ? pct(t0.afterRateBp) : ''));
  let payFrequency = $state(sent?.payFrequency ?? t0.payFrequency);
  let payDay = $state(sent?.payDay ?? String(t0.payDay));
  let baseDays = $state(sent?.baseDays ?? String(t0.baseDays));
  let withholding = $state(sent?.withholding ?? pct(t0.withholdingBp));
  const errors = $derived(form && 'errors' in form ? (form.errors as Record<string, string>) : {});
  const withheldPct = $derived(pct(v.terms.withholdingBp));
</script>

<svelte:head>
  <title>Intereses · {v.account.name} · Soleva</title>
</svelte:head>

<div class="page">
  <header class="top">
    <a class="back" href="/cuentas/{v.account.id}" aria-label="Volver a {v.account.name}">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg
      >
    </a>
    <span class="sv-label">Cuenta remunerada</span>
    <span class="spacer"></span>
  </header>

  <form method="POST" use:enhance class="grid" novalidate>
    <div class="side sv-enter">
      <div class="head">
        <span class="name">{v.account.name}</span>
        <span class="value num">{eur(v.account.cents)}</span>
      </div>
      <section class="month" aria-label="Intereses del periodo">
        <span class="sv-muted small"
          >Intereses de {month(v.period.to)}, sobre el saldo de cada día</span
        >
        <div class="line"><span>Brutos</span><span class="num">{eur(v.period.gross)}</span></div>
        <div class="line sv-muted">
          <span>Retención ({withheldPct} %)</span><span class="num">−{eur(v.period.withheld)}</span>
        </div>
        <div class="line strong">
          <span
            >Netos · {v.period.payOn === v.period.to
              ? 'pagados hoy'
              : `se pagan el ${date(v.period.payOn)}`}</span
          ><span class="num accent">+{eur(v.period.net)}</span>
        </div>
        <span class="sv-muted small"
          >Saldo medio desde el {date(v.period.from)}: {formatEuros(data.view.averageCents)}.</span
        >
      </section>
    </div>

    <div class="main sv-enter">
      <section class="tiers" aria-labelledby="tramos">
        <h2 id="tramos" class="sv-label">Tramos</h2>
        {#each tiers as tier, i (i)}
          <div class="row">
            {#if i === tiers.length - 1}
              <span class="sv-muted"
                >{tiers.length > 1
                  ? `Lo que pase de ${tiers[i - 1]!.upTo || '…'} €`
                  : 'Todo el saldo'}</span
              >
              <input type="hidden" name="tier_upto" value="" />
            {:else}
              <span class="sv-muted in"
                >Hasta <input
                  name="tier_upto"
                  bind:value={tier.upTo}
                  inputmode="decimal"
                  aria-label="Tramo {i + 1}: hasta (€)"
                /> €</span
              >
            {/if}
            <span class="in"
              ><input
                class="rate"
                name="tier_rate"
                bind:value={tier.rate}
                inputmode="decimal"
                aria-label="Tramo {i + 1}: interés anual (%)"
              /> %</span
            >
            {#if tiers.length > 1}
              <button
                type="button"
                class="remove"
                aria-label="Quitar tramo {i + 1}"
                onclick={() => tiers.splice(i, 1)}>×</button
              >
            {/if}
          </div>
        {/each}
        {#if tiers.length < 5}
          <button
            type="button"
            class="add"
            onclick={() => tiers.splice(tiers.length - 1, 0, { upTo: '', rate: '' })}
            >+ Añadir tramo</button
          >
        {/if}
        {#if errors.tiers}<span class="err" role="alert">{errors.tiers}</span>{/if}
      </section>

      <section class="rows">
        <label class="row"
          ><span class="sv-muted">Promoción</span><input
            type="checkbox"
            class="sv-switch"
            role="switch"
            name="promo"
            bind:checked={promo}
          /></label
        >
        {#if promo}
          <div class="row">
            <span class="sv-muted">Hasta</span><span class="in"
              ><input
                type="date"
                name="promo_until"
                bind:value={promoUntil}
                aria-label="Promoción hasta"
              />
              · luego
              <input
                class="rate"
                name="after_rate"
                bind:value={afterRate}
                inputmode="decimal"
                aria-label="Interés después de la promoción (%)"
              /> %</span
            >
          </div>
          {#if errors.promo}<span class="err" role="alert">{errors.promo}</span>{/if}
        {/if}
        <div class="row">
          <span class="sv-muted">Pago de intereses</span><span class="in"
            ><select name="pay_frequency" bind:value={payFrequency} aria-label="Cada cuánto paga">
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>, día
            <select name="pay_day" bind:value={payDay} aria-label="Día de pago">
              {#each Array.from({ length: 30 }, (_, i) => i + 1) as d (d)}<option value={String(d)}
                  >{d}</option
                >{/each}
              <option value="31">último</option>
            </select></span
          >
        </div>
        {#if errors.pay}<span class="err" role="alert">{errors.pay}</span>{/if}
        <label class="row"
          ><span class="sv-muted">Cálculo</span><select name="base_days" bind:value={baseDays}>
            <option value="365">Base 365 días</option>
            <option value="360">Base 360 días</option>
          </select></label
        >
        <label class="row"
          ><span class="sv-muted">Retención</span><span class="in"
            ><input
              class="rate"
              name="withholding"
              bind:value={withholding}
              inputmode="decimal"
              aria-label="Retención (%)"
            /> %</span
          ></label
        >
        {#if errors.withholding}<span class="err" role="alert">{errors.withholding}</span>{/if}
      </section>

      {#if v.canEdit}
        <div class="end">
          <button class="sv-btn sv-btn--primary save">Guardar</button>
          <span class="subtle small"
            >Copia las condiciones de tu banco. Si el pago real difiere en céntimos, se cuadra.</span
          >
        </div>
      {/if}
    </div>
  </form>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-width: 560px;
    margin: 0 auto;
    width: 100%;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .back,
  .spacer {
    width: 40px;
    height: 40px;
  }
  .back {
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
  }
  h2 {
    margin: 0;
  }
  .grid,
  .main,
  .side,
  .tiers,
  .month {
    display: flex;
    flex-direction: column;
  }
  .grid,
  .main,
  .side {
    gap: var(--space-6);
  }
  .tiers,
  .month {
    gap: 8px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .name {
    font-size: 22px;
    font-weight: 600;
  }
  .value {
    font-size: 20px;
    font-weight: 600;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .line {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
  }
  .strong {
    font-weight: 600;
  }
  .accent {
    color: var(--accent);
  }
  .small {
    font-size: 12px;
    line-height: 1.45;
  }
  .subtle {
    color: var(--ink-subtle);
  }
  input,
  select {
    font: inherit;
    color: var(--ink);
    background: transparent;
    border: 0;
    color-scheme: dark;
  }
  input:focus,
  select:focus {
    outline: none;
  }
  input:focus-visible,
  select:focus-visible {
    box-shadow: 0 1.5px 0 var(--accent);
  }
  select option {
    background: var(--bg);
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    border-bottom: 1px solid var(--hairline);
    font-size: 14px;
  }
  .row select {
    text-align: right;
    font-weight: 500;
  }
  .in {
    display: flex;
    align-items: center;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }
  .in input {
    width: 96px;
    height: 32px;
    text-align: right;
    font-weight: 600;
    border-bottom: 1.5px solid var(--hairline-strong);
  }
  .in input.rate {
    width: 52px;
  }
  .in input[type='date'] {
    width: 130px;
  }
  .remove,
  .add {
    background: transparent;
    border: 0;
    font: inherit;
    cursor: pointer;
  }
  .remove {
    width: 32px;
    height: 32px;
    font-size: 18px;
    color: var(--ink-muted);
  }
  .add {
    text-align: left;
    min-height: 44px;
    color: var(--accent);
    font-size: 14px;
    font-weight: 500;
  }
  .row .sv-switch {
    appearance: none;
    margin: 0;
  }
  .row .sv-switch:checked {
    background: var(--accent);
  }
  .row .sv-switch:checked::after {
    transform: translateX(18px);
    background: var(--on-accent);
  }
  .end {
    display: flex;
    flex-direction: column;
    gap: 10px;
    text-align: center;
  }
  .save {
    min-height: 52px;
    font-size: 16px;
  }
  .err {
    font-size: 12px;
    color: var(--negative);
  }
  @media (min-width: 1024px) {
    .page {
      max-width: 1000px;
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 400px);
      gap: var(--space-7);
      align-items: start;
    }
    .main {
      grid-column: 1;
      grid-row: 1;
    }
  }
</style>
