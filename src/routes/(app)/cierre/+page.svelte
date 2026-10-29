<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Count } from '#lib/count.svelte.ts';
  import { formatEuros, parseEuros } from '#lib/engine/money.ts';
  import { FOLLOWS_SCENARIO } from '#lib/labels.ts';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const monthName = (m: string) =>
    new Date(`${m}-15`).toLocaleDateString('es-ES', { month: 'long' });
  const title = (m: string) => monthName(m).replace(/^./, (c) => c.toUpperCase());
  // Spanish decimals for the inputs: 125050 → "1250,50".
  const decimal = (n: number) => (n / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
  const signed = (n: number) => `${n > 0 ? '+' : ''}${formatEuros(n, { withCents: true })}`;

  const errors = $derived((form?.errors ?? {}) as Record<string, string | undefined>);
  // What the user typed, per account: the proposal, or what came back with an error. Lines with
  // an error start open. bind:open, because open={…} is reapplied on every render and closed the
  // line while typing.
  let typed = $state<Record<string, string>>({});
  let opened = $state<Record<string, boolean>>({});
  $effect.pre(() => {
    const back = form?.values as Record<string, string> | undefined;
    typed = Object.fromEntries(
      data.lines.map((l) => [l.account.id, back?.[l.account.id] ?? decimal(l.proposedCents)]),
    );
    opened = Object.fromEntries(Object.keys(errors).map((id) => [id, true]));
  });

  const cents = (id: string, proposed: number) => parseEuros(typed[id] ?? '') ?? proposed;
  const edited = (id: string, proposed: number) => cents(id, proposed) !== proposed;
  const total = $derived(
    data.lines.reduce((sum, l) => {
      const c = cents(l.account.id, l.proposedCents);
      return sum + (l.account.kind === 'deuda' ? -c : c);
    }, 0),
  );

  function meta(l: PageProps['data']['lines'][number]) {
    const { kind } = l.account;
    if (FOLLOWS_SCENARIO.includes(kind))
      return l.rulesCents
        ? `${signed(l.rulesCents)} aportados · pon el valor de hoy`
        : 'Pon el valor de hoy';
    if (kind === 'vehiculo' || kind === 'inmueble')
      return l.accrualCents
        ? `Estimado: ${signed(l.accrualCents)} de ${l.accrualCents < 0 ? 'depreciación' : 'revalorización'}`
        : 'Estimado: sin cambios';
    // A debt's interest is shown apart from what the rules pay (invariant a).
    const parts =
      kind === 'deuda'
        ? [
            l.rulesCents ? `Pagas ${formatEuros(-l.rulesCents, { withCents: true })}` : '',
            l.accrualCents ? `Intereses ${signed(l.accrualCents)}` : '',
          ]
        : [
            l.rulesCents ? `${signed(l.rulesCents)} por tus reglas` : '',
            l.accrualCents ? `${signed(l.accrualCents)} de intereses` : '',
          ];
    return parts.filter(Boolean).join(' · ') || 'Sin movimientos este mes';
  }
  const estimated = $derived(
    data.lines.filter((l) => l.account.kind === 'vehiculo' || l.account.kind === 'inmueble'),
  );

  // The time it took and the count up, only with JavaScript; without it the result shows as is.
  const started = Date.now();
  let seconds = $state<number | null>(null);
  const shown = new Count();
  let counting = $state(false);
  $effect(() => {
    const done = form?.done;
    if (!done) return;
    // Untracked: Count reads its own value, which would restart this effect every frame.
    untrack(() => {
      shown.value = done.prev?.netCents ?? 0;
      counting = true;
      shown.to(done.net, 1200);
    });
    return () => shown.stop();
  });
</script>

<svelte:head>
  <title>Cierre de mes · Soleva</title>
</svelte:head>

<header class="top">
  <a class="back" href="/inicio" aria-label="Volver a Inicio">
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
  <span class="sv-label">Cierre de mes</span>
  <span class="spacer"></span>
</header>

{#if form?.done}
  {@const done = form.done}
  <section class="done">
    <div class="badge">
      <span class="ring" aria-hidden="true"></span>
      <span class="pop">
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--on-accent)"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          role="img"
          aria-label="Hecho"><path class="sv-draw" pathLength="1" d="M5 12.5l4.5 4.5L19 7.5" /></svg
        >
      </span>
    </div>
    <div class="stack">
      <h1 class="title">Saldos confirmados</h1>
      <p class="sv-muted">
        {title(done.month)} cerrado{seconds ? ` en ${seconds} segundos` : ''}.
      </p>
    </div>
    <div class="result">
      <span class="sv-muted small">Tu patrimonio</span>
      <span class="big" aria-live="polite">{formatEuros(counting ? shown.value : done.net)}</span>
      {#if done.prev}
        <span class="delta"
          >{done.net >= done.prev.netCents ? '+' : ''}{formatEuros(done.net - done.prev.netCents)}
          respecto a {monthName(done.prev.month)}</span
        >
      {:else}
        <span class="delta">Tu primer mes cerrado</span>
      {/if}
    </div>
    <a class="sv-btn sv-btn--ghost" href="/inicio">Volver a Inicio</a>
  </section>
{:else if !data.month}
  <section class="f1 stack">
    <h1 class="title">Este mes ya está cerrado</h1>
    <p class="sv-muted body">
      Vuelve cuando acabe el mes: Soleva te propondrá los saldos a partir de tus reglas.
    </p>
    <a class="sv-btn sv-btn--ghost" href="/inicio">Volver a Inicio</a>
  </section>
{:else if !data.lines.length}
  <section class="f1 stack">
    <h1 class="title">Cierre de {monthName(data.month)}</h1>
    <p class="sv-muted body">Para cerrar el mes necesitas al menos una cuenta.</p>
    <a class="sv-btn sv-btn--accent" href="/cuentas/nueva">Crear mi primera cuenta</a>
  </section>
{:else}
  <form
    method="POST"
    action="?/confirmar"
    class="review"
    use:enhance={() => {
      const took = Math.round((Date.now() - started) / 1000);
      return async ({ result, update }) => {
        if (result.type === 'success') seconds = Math.min(59, Math.max(4, took));
        await update({ reset: false });
      };
    }}
  >
    <section class="f1 stack">
      <h1 class="title">Cierre de {monthName(data.month)}</h1>
      <p class="sv-muted body">Tus reglas proponen estos saldos. Toca uno para corregirlo.</p>
    </section>

    <section class="f2 lines">
      {#each data.lines as l (l.account.id)}
        {@const id = l.account.id}
        {@const isEdited = edited(id, l.proposedCents)}
        {@const c = cents(id, l.proposedCents)}
        <details class="line" bind:open={opened[id]}>
          <summary>
            <span class="tick" class:tick--on={isEdited} aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg
              >
            </span>
            <span class="sv-row__main">
              <span class="sv-row__title">{l.account.name}</span>
              <span class="meta" class:meta--edited={isEdited}
                >{isEdited ? 'Corregido por ti' : meta(l)}</span
              >
            </span>
            <span class="sv-row__value"
              >{formatEuros(l.account.kind === 'deuda' ? -c : c, { withCents: true })}</span
            >
          </summary>
          <div class="edit">
            <label class="sv-field__box">
              <span class="visually-hidden"
                >{l.account.kind === 'deuda' ? 'Lo que debes en' : 'Saldo real de'}
                {l.account.name}</span
              >
              <input
                class="sv-field__input"
                name={id}
                inputmode="decimal"
                autocomplete="off"
                bind:value={typed[id]}
                aria-invalid={!!errors[id]}
                aria-describedby={errors[id] ? `${id}-error` : undefined}
              />
              <span class="sv-field__suffix">€</span>
            </label>
            <button
              type="button"
              class="sv-btn sv-btn--primary sv-btn--sm done-btn"
              onclick={() => (opened[id] = false)}>Listo</button
            >
          </div>
          {#if errors[id]}<span class="err" id="{id}-error">{errors[id]}</span>{/if}
        </details>
      {/each}
    </section>

    <section class="f3 total">
      <span class="sv-muted">Patrimonio al cerrar</span>
      <span class="sum">{formatEuros(total, { withCents: true })}</span>
    </section>

    <div class="f4 actions">
      <button class="sv-btn sv-btn--primary">Confirmar saldos</button>
      {#if estimated.length}
        <p class="note">
          {estimated.map((l) => l.account.name).join(', ')}
          {estimated.length > 1 ? 'se valoran' : 'se valora'} solo con su estimación.
        </p>
      {/if}
    </div>
  </form>
{/if}

<style>
  h1,
  p {
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
  .stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .stack .sv-btn {
    margin-top: var(--space-4);
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
  .review {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-width: 560px;
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
  summary:active {
    transform: scale(0.99);
  }
  .tick {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-soft);
    color: var(--accent);
    transition: background var(--duration-fast) var(--ease-standard);
  }
  .tick--on {
    background: var(--accent);
    color: var(--on-accent);
  }
  .meta {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .meta--edited {
    color: var(--accent);
  }
  .edit {
    display: flex;
    gap: 8px;
    padding: 0 0 14px 44px;
  }
  .edit .sv-field__box {
    flex: 1 1 auto;
    min-width: 0;
    border-bottom: 1.5px solid var(--accent);
    box-shadow: 0 8px 16px -12px var(--accent);
  }
  .done-btn {
    min-height: 46px;
  }
  .err {
    display: block;
    padding: 0 0 14px 44px;
    font-size: 13px;
    color: var(--negative);
  }
  .total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 4px 0;
    font-size: 14px;
  }
  .sum {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .actions .sv-btn {
    min-height: 52px;
    font-size: 16px;
  }
  .note {
    text-align: center;
    font-size: 12px;
    color: var(--ink-subtle);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .done {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22px;
    text-align: center;
    padding-top: var(--space-6);
  }
  .done .stack {
    align-items: center;
  }
  .badge {
    position: relative;
    width: 96px;
    height: 96px;
  }
  .ring,
  .pop {
    position: absolute;
    inset: 0;
    border-radius: 50%;
  }
  .ring {
    border: 2px solid var(--accent);
    animation: ring 1.4s var(--ease-out) 0.2s both;
  }
  .pop {
    background: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 40px var(--accent-line);
    animation: pop 0.7s var(--ease-out) both;
  }
  .result {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 20px 0;
    min-width: 260px;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }
  .small {
    font-size: 13px;
  }
  .big {
    font-size: 44px;
    font-weight: 600;
    letter-spacing: -0.045em;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
  }
  .delta {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
  }
  @keyframes pop {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    60% {
      transform: scale(1.08);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  @keyframes ring {
    0% {
      transform: scale(0.8);
      opacity: 0.6;
    }
    100% {
      transform: scale(1.6);
      opacity: 0;
    }
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
    .f4,
    .ring,
    .pop {
      animation: none;
    }
  }
</style>
