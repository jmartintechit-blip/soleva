<script lang="ts">
  import { onMount } from 'svelte';
  import Logo from '#lib/components/Logo.svelte';
  import { Count } from '#lib/count.svelte.ts';
  import { formatEuros } from '#lib/engine/money.ts';
  import { plannedAt, project, status } from '#lib/engine/project.ts';
  import { netWorth } from '#lib/engine/rules.ts';
  import { KIND_LABEL } from '#lib/labels.ts';
  import type { PageData } from './$types';

  // Inicio before the cut-over to the ledger (v0): closes, rules and the projection.
  let { data }: { data: Extract<PageData, { ledger: false }> } = $props();

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

  // Evolution: the closed months plus today, drawn at the real width (see /proyeccion).
  const series = $derived([...data.history.map((h) => h.netCents), now]);
  let width = $state(346);
  const H = 86;
  const spark = $derived.by(() => {
    const min = Math.min(...series);
    const span = Math.max(...series) - min || 1;
    const x = (k: number) => 4 + (k * (width - 14)) / (series.length - 1);
    const y = (v: number) => H - 6 - ((v - min) / span) * (H - 16);
    const line = series.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`);
    return {
      line: line.join(' '),
      area: `${line.join(' ')} L${x(series.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`,
      end: { x: x(series.length - 1), y: y(now) },
    };
  });
  const monthName = (m: string, opts: Intl.DateTimeFormatOptions = { month: 'long' }) =>
    new Date(`${m}-15`).toLocaleDateString('es-ES', opts);
  const last = $derived(data.history.at(-1));
  const change = $derived(last ? now - last.netCents : 0);

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
  <div class="cols">
    <div class="main">
      <section class="sv-hero f1">
        <span class="sv-hero__label">Tu patrimonio hoy</span>
        <span class="sv-hero__value" aria-live="polite"
          >{formatEuros(shown.value, { withCents: true })}</span
        >
        <span class="sv-hero__meta">
          {#if last}
            <span class="up"
              >{change >= 0 ? '+' : ''}{formatEuros(change, { withCents: true })}</span
            >
            desde el cierre de
            {monthName(last.month)}
          {:else}
            Lo que tienes menos lo que debes.
          {/if}
        </span>
      </section>

      {#if data.history.length}
        {@const first = data.history[0]!.month}
        <section class="f2 spark" bind:clientWidth={width}>
          <svg
            viewBox="0 0 {width} {H}"
            {width}
            height={H}
            role="img"
            aria-label="Evolución de tu patrimonio desde {monthName(first, {
              month: 'long',
              year: 'numeric',
            })}: de {formatEuros(series[0]!, { withCents: true })} a {formatEuros(now, {
              withCents: true,
            })}."
          >
            <defs>
              <linearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="var(--accent)" stop-opacity=".22" />
                <stop offset="1" stop-color="var(--accent)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path d={spark.area} fill="url(#spk)" />
            <path
              class="sv-draw"
              pathLength="1"
              d={spark.line}
              fill="none"
              stroke="var(--accent)"
              stroke-width="2.25"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle class="sv-halo" cx={spark.end.x} cy={spark.end.y} r="10" fill="var(--accent)" />
            <circle cx={spark.end.x} cy={spark.end.y} r="4" fill="var(--accent)" />
          </svg>
          <div class="axis">
            <span>{monthName(first, { month: 'short', year: 'numeric' })}</span><span>Hoy</span>
          </div>
        </section>
      {/if}

      <a class="f2 ahead" href="/proyeccion">
        {#if light}
          <span class="sv-pill" class:sv-pill--ok={light.level === 'en_camino'}>
            <span class="sv-pill__dot"></span>
            {light.level === 'en_camino' ? 'Vas en camino' : 'Algo por debajo del plan'}
          </span>
        {/if}
        <span class="sv-muted">En 10 años: ~{formatEuros(in10)}</span>
      </a>

      {#if data.toClose}
        <a class="f3 close" href="/cierre">
          <span class="close__icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><rect x="4" y="5" width="16" height="15" rx="2" /><path
                d="M8 3v4M16 3v4M8 13l3 3 5-6"
              /></svg
            >
          </span>
          <span class="sv-row__main">
            <span class="sv-row__title">Cierra {monthName(data.toClose)}</span>
            <span class="sv-row__meta"
              >{live.length === 1 ? '1 saldo propuesto' : `${live.length} saldos propuestos`} · menos
              de 1 minuto</span
            >
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg
          >
        </a>
      {/if}

      {#if !data.rules.length}
        <a class="f3 sv-row card" href="/reglas/nueva">
          <span class="sv-row__main">
            <span class="sv-row__title">Crea tu primera regla</span>
            <span class="sv-row__meta">Tu nómina, tus gastos fijos o lo que apartas cada mes</span>
          </span>
        </a>
      {/if}
    </div>

    <div class="side">
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
              {formatEuros(a.kind === 'deuda' ? -a.balanceCents : a.balanceCents, {
                withCents: true,
              })}
            </span>
          </a>
        {/each}
      </section>

      <p class="sv-legal">Las proyecciones son estimaciones, no asesoramiento.</p>
    </div>
  </div>
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
  .up {
    color: var(--accent);
    font-weight: 600;
  }
  .spark {
    max-width: 720px;
  }
  .spark svg {
    display: block;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-subtle);
  }
  .close {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 0;
    margin-bottom: var(--space-5);
    max-width: 720px;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
    color: inherit;
    text-decoration: none;
  }
  .close:active {
    transform: scale(0.97);
  }
  .close > svg {
    color: var(--ink-muted);
  }
  .close__icon {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
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
  /* Desktop: your wealth and where it goes on the left, the accounts that make it on the right. */
  @media (min-width: 1024px) {
    .cols {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
      align-items: start;
      gap: var(--space-8);
    }
    .side {
      padding-top: var(--space-2);
    }
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
