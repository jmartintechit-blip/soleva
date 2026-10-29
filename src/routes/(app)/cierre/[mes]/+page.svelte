<script lang="ts">
  import { enhance } from '$app/forms';
  import { formatEuros } from '#lib/engine/money.ts';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const close = $derived(data.close);
  const title = (m: string) =>
    new Date(`${m}-15`)
      .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      .replace(/^./, (c) => c.toUpperCase());
  const day = (at: string) =>
    new Date(at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  const decimal = (n: number) => (n / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
  const value = (cents: number, isDebt: boolean) =>
    formatEuros(isDebt ? -cents : cents, { withCents: true });
  const net = $derived(
    close.lines.reduce((s, l) => s + (l.isDebt ? -l.confirmedCents : l.confirmedCents), 0),
  );

  const errors = $derived((form?.errors ?? {}) as Record<string, string | undefined>);
  const back = $derived(form?.values as { amount: string; reason: string } | undefined);
  // The line with an error stays open; a saved change closes it. Nothing here re-renders while
  // typing (the inputs hold no state), so open={…} does not close it as it did in /cierre.
</script>

<svelte:head>
  <title>{title(close.month)} · Soleva</title>
</svelte:head>

<header class="top">
  <a class="back" href="/cierre" aria-label="Volver a Cierre de mes">
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
  <span class="sv-label">Mes cerrado</span>
  <span class="spacer"></span>
</header>

<div class="page">
  <div class="main">
    <section class="f1 stack">
      <h1 class="title">{title(close.month)}</h1>
      <p class="sv-muted body">
        Confirmado el {day(close.confirmedAt)}. Si un saldo estaba mal, pulsa Corregir: queda
        anotado el cambio y su motivo.
      </p>
    </section>

    <section class="f2 lines">
      {#each close.lines as l (l.accountId)}
        {@const mine = form?.account === l.accountId}
        <details class="line" open={mine}>
          <summary>
            <span class="sv-row__main">
              <span class="sv-row__title">{l.name}</span>
              <span class="meta" class:meta--edited={l.amendments.length > 0}
                >{l.amendments.length
                  ? `Corregido ${l.amendments.length === 1 ? 'una vez' : `${l.amendments.length} veces`}`
                  : l.confirmedCents !== l.proposedCents
                    ? 'Corregido por ti al cerrar'
                    : 'Como lo propusieron tus reglas'}</span
              >
            </span>
            <span class="sv-row__value">{value(l.confirmedCents, l.isDebt)}</span>
            <!-- The summary does the toggling; this says what it is for. -->
            <span class="fix">Corregir</span>
          </summary>
          {#if l.amendments.length}
            <ol class="trail">
              {#each l.amendments as a, k (k)}
                <li>
                  {day(a.at)}: {value(a.previousCents, l.isDebt)} → {value(a.newCents, l.isDebt)} ·
                  <span class="reason">{a.reason}</span>
                </li>
              {/each}
            </ol>
          {/if}
          <form
            method="POST"
            action="?/enmendar"
            class="edit"
            use:enhance={() =>
              async ({ update }) => {
                await update({ reset: false });
              }}
          >
            <input type="hidden" name="account" value={l.accountId} />
            <label class="sv-field__box">
              <span class="visually-hidden"
                >{l.isDebt ? 'Lo que debías en' : 'Saldo real de'} {l.name}</span
              >
              <input
                class="sv-field__input"
                name="amount"
                inputmode="decimal"
                autocomplete="off"
                value={mine && back ? back.amount : decimal(l.confirmedCents)}
                aria-invalid={mine && !!errors.amount}
              />
              <span class="sv-field__suffix">€</span>
            </label>
            {#if mine && errors.amount}<span class="err">{errors.amount}</span>{/if}
            <label class="sv-field__box">
              <span class="visually-hidden">Motivo del cambio en {l.name}</span>
              <input
                class="sv-field__input"
                name="reason"
                maxlength="200"
                autocomplete="off"
                placeholder="Motivo, por ejemplo: olvidé un recibo"
                value={mine && back ? back.reason : ''}
                aria-invalid={mine && !!errors.reason}
              />
            </label>
            {#if mine && errors.reason}<span class="err">{errors.reason}</span>{/if}
            <button class="sv-btn sv-btn--primary sv-btn--sm">Guardar cambio</button>
          </form>
        </details>
      {/each}
    </section>
  </div>

  <div class="side">
    <section class="f3 total">
      <span class="sv-muted">Patrimonio al cerrar</span>
      <span class="sum">{formatEuros(net, { withCents: true })}</span>
    </section>
    {#if form?.amended}
      <p class="saved" role="status">Cambio guardado</p>
    {/if}
  </div>
</div>

<style>
  h1,
  p,
  ol {
    margin: 0;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-5);
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
  .page,
  .main,
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  /* Desktop: the balances left, what they add up to right. */
  @media (min-width: 1024px) {
    .page {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
      align-items: start;
      gap: var(--space-8);
    }
    .side {
      position: sticky;
      top: var(--space-6);
      padding-top: var(--space-4);
      border-top: 1px solid var(--hairline);
    }
  }
  .fix {
    flex: none;
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
    font-size: 13px;
    font-weight: 600;
  }
  details[open] .fix {
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .title {
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.15;
  }
  .body {
    font-size: 15px;
    line-height: 1.5;
    max-width: 48ch;
  }
  .lines {
    display: flex;
    flex-direction: column;
  }
  .line {
    border-bottom: 1px solid var(--hairline);
  }
  summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 0;
    min-height: 44px;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary .sv-row__value {
    white-space: nowrap;
  }
  .meta {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .meta--edited {
    color: var(--accent);
  }
  .trail {
    padding: 0 0 10px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .reason {
    color: var(--ink);
  }
  .edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 0 14px;
  }
  .edit .sv-field__box {
    border-bottom: 1.5px solid var(--accent);
  }
  .edit .sv-btn {
    align-self: flex-start;
    min-height: 44px;
  }
  .err {
    font-size: 13px;
    color: var(--negative);
  }
  .total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 14px;
  }
  .sum {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .saved {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .f1,
  .f2,
  .f3 {
    animation: sv-fade-up 0.8s var(--ease-out) both;
  }
  .f2 {
    animation-delay: 0.1s;
  }
  .f3 {
    animation-delay: 0.2s;
  }
  @media (prefers-reduced-motion: reduce) {
    .f1,
    .f2,
    .f3 {
      animation: none;
    }
  }
</style>
