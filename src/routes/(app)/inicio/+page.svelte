<script lang="ts">
  import { onMount } from 'svelte';
  import Logo from '#lib/components/Logo.svelte';
  import { Count } from '#lib/count.svelte.ts';
  import { formatEuros } from '#lib/engine/money.ts';
  import { plannedAt, project, status } from '#lib/engine/project.ts';
  import { netWorth } from '#lib/engine/rules.ts';
  import { KIND_LABEL } from '#lib/labels.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const live = $derived(data.accounts.filter((a) => !a.archived));
  const now = $derived(netWorth(live));
  const in10 = $derived(
    project(
      live,
      data.rules,
      data.month,
      { annualBp: data.assumptions.base, inflationBp: data.assumptions.inflation },
      120,
    ).at(-1)?.realCents ?? now,
  );
  const light = $derived.by(() => {
    const planned = data.baseline && plannedAt(data.baseline, data.month);
    return planned == null ? null : status(now, planned);
  });

  const shown = new Count();
  onMount(() => {
    shown.to(now, 1500);
    return () => shown.stop();
  });
</script>

<svelte:head>
  <title>Inicio · Soleva</title>
</svelte:head>

<header class="top">
  <span class="logo"><Logo /></span>
  <a class="plus" href="/reglas/nueva" aria-label="Crear regla">
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
    >
  </a>
</header>

{#if !live.length}
  <section class="f1 welcome">
    <h1 class="title-lg">Empecemos por tus cuentas</h1>
    <p class="body sv-muted">
      Apunta dónde tienes tu dinero: el banco, tu bróker, quizá un coche o una deuda. Solo nombre y
      saldo; nada se conecta a tu banco.
    </p>
    <a class="sv-btn sv-btn--accent" href="/cuentas/nueva">Crear mi primera cuenta</a>
  </section>
{:else}
  <section class="sv-hero f1">
    <span class="sv-hero__label">Tu patrimonio hoy</span>
    <span class="sv-hero__value" aria-live="polite">{formatEuros(shown.value)}</span>
    <span class="sv-hero__meta">Lo que tienes menos lo que debes.</span>
  </section>

  <a class="f2 ahead" href="/proyeccion">
    {#if light}
      <span class="sv-pill" class:sv-pill--ok={light.level === 'en_camino'}>
        <span class="sv-pill__dot"></span>
        {light.level === 'en_camino' ? 'Vas en camino' : 'Algo por debajo del plan'}
      </span>
    {/if}
    <span class="sv-muted">En 10 años: ~{formatEuros(in10)}</span>
  </a>

  {#if !data.rules.length}
    <a class="f3 sv-row card" href="/reglas/nueva">
      <span class="sv-row__main">
        <span class="sv-row__title">Crea tu primera regla</span>
        <span class="sv-row__meta">Tu nómina, tus gastos fijos o lo que apartas cada mes</span>
      </span>
    </a>
  {/if}

  <section class="f4 accounts" aria-labelledby="cuentas">
    <div class="head">
      <h2 id="cuentas">Cuentas</h2>
      <a href="/cuentas" class="sv-muted">{live.length}</a>
    </div>
    {#each live as a (a.id)}
      <a class="sv-row" href="/cuentas/{a.id}">
        <span class="sv-row__main">
          <span class="sv-row__title">{a.name}</span>
          <span class="sv-row__meta"
            >{KIND_LABEL[a.kind]}{a.isEstimated ? ' · valor estimado' : ''}</span
          >
        </span>
        <span class="sv-row__value">
          {formatEuros(a.kind === 'deuda' ? -a.balanceCents : a.balanceCents, { withCents: true })}
        </span>
      </a>
    {/each}
  </section>

  <p class="sv-legal">Las proyecciones son estimaciones, no asesoramiento.</p>
{/if}

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
  }
  @media (min-width: 1024px) {
    .logo {
      visibility: hidden;
    }
  }
  .plus {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
  }
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    max-width: 48ch;
  }
  h1,
  h2,
  p {
    margin: 0;
  }
  .ahead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-5) 0 var(--space-6);
    font-size: 13px;
    color: inherit;
    text-decoration: none;
  }
  .card,
  .accounts .sv-row {
    color: inherit;
    text-decoration: none;
  }
  .card {
    margin-bottom: var(--space-5);
    border-top: 1px solid var(--hairline);
  }
  .accounts {
    display: flex;
    flex-direction: column;
    max-width: 720px;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: var(--space-2);
  }
  h2 {
    font-size: 17px;
    font-weight: 600;
  }
  .head a {
    font-size: 13px;
  }
  .sv-legal {
    margin-top: var(--space-6);
  }
  .f1,
  .f2,
  .f3,
  .f4 {
    animation: sv-fade-up 0.8s var(--ease-out) both;
  }
  .f2 {
    animation-delay: 0.1s;
  }
  .f3 {
    animation-delay: 0.2s;
  }
  .f4 {
    animation-delay: 0.3s;
  }
  @media (prefers-reduced-motion: reduce) {
    .f1,
    .f2,
    .f3,
    .f4 {
      animation: none;
    }
  }
</style>
