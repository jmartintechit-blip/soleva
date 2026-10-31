<script lang="ts">
  import { formatEuros } from '#lib/engine/money.ts';
  import { FREQUENCY_LABEL, TYPE_LABEL } from '#lib/labels.ts';
  import Ledger from './Ledger.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const EVERY = {
    mensual: 'al mes',
    trimestral: 'al trimestre',
    anual: 'al año',
    una_vez: 'una vez',
  };
  const SIGN = { entra: '+', sale: '−', mueve: '' };
  const name = (id?: string) => (id ? (data.names[id] ?? '') : '');
  const route = (r: (typeof data.rules)[number]) =>
    [name(r.fromAccountId), name(r.toAccountId)].filter(Boolean).join(' → ');
</script>

<svelte:head>
  <title>Reglas · Soleva</title>
</svelte:head>

{#if data.ledger}
  <Ledger {...data.ledger} />
{:else}
  <header class="sv-enter">
    <div>
      <h1 class="title-lg">Reglas</h1>
      <p class="body sv-muted">
        Cómo entra, sale y se mueve tu dinero. Soleva no mueve dinero: solo apunta lo que tú haces.
      </p>
    </div>
    {#if data.hasAccounts}
      <a class="sv-btn sv-btn--primary sv-btn--sm" href="/reglas/nueva">Nueva regla</a>
    {/if}
  </header>

  {#if !data.hasAccounts}
    <p class="body sv-muted">
      Las reglas mueven dinero entre tus cuentas. <a href="/cuentas/nueva"
        >Crea primero una cuenta</a
      >.
    </p>
  {:else if !data.rules.length}
    <p class="body sv-muted">
      Aún no tienes reglas. Empieza por tu nómina, tus gastos fijos y lo que apartas cada mes.
    </p>
  {/if}

  <section aria-label="Tus reglas">
    {#each data.rules as r (r.id)}
      <div class="sv-row" class:off={!r.active}>
        <a class="sv-row__main" href="/reglas/{r.id}">
          <span class="sv-row__title">{r.name}</span>
          <span class="sv-row__meta">
            {TYPE_LABEL[r.type]} · {r.frequency === 'una_vez'
              ? `una vez, ${r.startMonth}`
              : `${FREQUENCY_LABEL[r.frequency].toLowerCase()}, día ${r.day}`}{route(r)
              ? ` · ${route(r)}`
              : ''}
          </span>
        </a>
        <span class="sv-row__value"
          >{SIGN[r.type]}{formatEuros(r.amountCents, { withCents: true })}
          <span class="sv-muted every">{EVERY[r.frequency]}</span></span
        >
        <form method="POST" action="?/activar">
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="active" value={String(!r.active)} />
          <button
            class="sv-switch"
            role="switch"
            aria-checked={r.active}
            aria-label="{r.name}: {r.active ? 'activa' : 'en pausa'}"
          ></button>
        </form>
      </div>
    {/each}
  </section>
{/if}

{#if data.created}
  <div class="toast" role="status">
    <span class="tick" aria-hidden="true">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg
      >
    </span>
    <span>Regla creada</span>
  </div>
{/if}

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }
  h1,
  p {
    margin: 0;
  }
  header p {
    margin-top: var(--space-2);
    max-width: 52ch;
  }
  section {
    display: flex;
    flex-direction: column;
  }
  .sv-row__main {
    color: inherit;
    text-decoration: none;
  }
  .sv-row__meta {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .off .sv-row__main,
  .off .sv-row__value {
    opacity: 0.5;
  }
  .sv-row__value {
    white-space: nowrap;
  }
  .every {
    display: block;
    font-size: 12px;
    font-weight: 400;
  }
  .toast {
    position: fixed;
    left: var(--space-5);
    right: var(--space-5);
    bottom: 112px;
    max-width: 420px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 18px;
    background: var(--ink);
    color: var(--bg);
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: sv-fade-up var(--duration-enter) var(--ease-out) both;
  }
  .tick {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  @media (min-width: 1024px) {
    .toast {
      bottom: var(--space-6);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
</style>
