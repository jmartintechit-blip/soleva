<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { formatEuros, parseEuros } from '#lib/engine/money.ts';
  import { parseUnits, unitsText } from '#lib/engine/units.ts';
  import type { PageProps } from './$types';

  // b11/NCuadre: what Soleva thinks is there against what is real. Only what does not match is
  // typed; each difference becomes an 'ajuste' of today.
  let { data, form }: PageProps = $props();

  const key = (r: (typeof data.rows)[number]) => (r.instrumentId ? `u:${r.instrumentId}` : 'cash');
  const unitWord = (kind: string) =>
    kind === 'accion' ? ' acc.' : kind === 'cripto' ? '' : ' part.';
  const isCash = (r: (typeof data.rows)[number]) => r.instrumentId === null;
  const expectedText = (r: (typeof data.rows)[number]) =>
    isCash(r)
      ? formatEuros(Number(r.expected), { withCents: true })
      : `${unitsText(BigInt(r.expected))}${unitWord(r.kind)}`;
  // What goes in the box when a row is opened: the expected value, ready to correct.
  const editable = (r: (typeof data.rows)[number]) =>
    isCash(r)
      ? (Number(r.expected) / 100).toFixed(2).replace('.', ',')
      : unitsText(BigInt(r.expected));

  // Rows opened, with what is typed; after a failed save the server sends them back.
  let typed = $state<Record<string, string>>(untrack(() => ({ ...(form?.values ?? {}) })));

  // The difference against the ledger, or null while it cannot be read.
  const diff = (r: (typeof data.rows)[number]): string | null => {
    const text = typed[key(r)] ?? '';
    if (isCash(r)) {
      const cents = parseEuros(text);
      if (cents === null) return null;
      const d = cents - Number(r.expected);
      return d === 0 ? '' : `${d > 0 ? '+' : ''}${formatEuros(d, { withCents: true })}`;
    }
    const qty = parseUnits(text);
    if (qty === null) return null;
    const d = qty - BigInt(r.expected);
    return d === 0n ? '' : `${d > 0n ? '+' : ''}${unitsText(d)}${unitWord(r.kind)}`;
  };
  const changes = $derived(data.rows.filter((r) => key(r) in typed && diff(r)).length);
  const where = $derived(
    ['broker', 'inversion'].includes(data.account.kind) ? 'del bróker' : 'de tu banco',
  );
</script>

<svelte:head>
  <title>Cuadre · {data.account.name} · Soleva</title>
</svelte:head>

<div class="page">
  <header class="top">
    <a class="back" href="/cuentas/{data.account.id}" aria-label="Volver a {data.account.name}">
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
    <span class="sv-label">Cuadre</span>
    <span class="spacer"></span>
  </header>

  <section class="intro sv-enter">
    <h1>Cuadra {data.account.name}</h1>
    <p class="sv-muted">
      Abre tu app {where} y cambia solo lo que no coincida. Lo demás déjalo como está.
    </p>
  </section>

  <form method="POST" use:enhance class="rows-form">
    <section class="rows" aria-label="Lo que hay en {data.account.name}">
      <div class="heads small"><span>Soleva cree que tienes</span><span>Lo real</span></div>
      {#each data.rows as r (key(r))}
        {@const k = key(r)}
        {@const d = k in typed ? diff(r) : ''}
        <div class="row">
          <span class="what">
            <span class="name">{r.name}</span>
            <span class="sv-muted small num" class:sv-neg={isCash(r) && Number(r.expected) < 0}
              >{expectedText(r)}</span
            >
          </span>
          {#if k in typed}
            <span class="real">
              <label class="box">
                <span class="visually-hidden">Valor real de {r.name}</span>
                <input
                  name={k}
                  bind:value={typed[k]}
                  inputmode="decimal"
                  autocomplete="off"
                  aria-invalid={d === null || !!form?.errors?.[k]}
                />
                {#if isCash(r)}<span class="sv-muted small">€</span>{/if}
              </label>
              <span class="diff small num" class:bad={d === null}
                >{form?.errors?.[k] ?? (d === null ? 'Revisa el número' : d || 'sin cambio')}</span
              >
            </span>
          {:else}
            <button
              type="button"
              class="same"
              aria-label="{r.name} coincide. Cambiar"
              onclick={() => (typed[k] = editable(r))}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg
              >Coincide
            </button>
          {/if}
        </div>
      {/each}
    </section>

    <p class="sv-muted note">
      Cada cambio se guarda como un <span class="ink">ajuste de hoy</span>. Tus reglas y tu plan no
      cambian; Soleva sigue desde lo real.
    </p>

    <div class="end">
      <button class="sv-btn sv-btn--primary save" disabled={changes === 0}
        >Guardar cuadre · {changes === 1 ? '1 cambio' : `${changes} cambios`}</button
      >
      <span class="sv-legal">Si todo coincide, no hace falta.</span>
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
  .intro {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.15;
  }
  .intro p {
    margin: 0;
    font-size: 15px;
    line-height: 1.5;
  }
  .rows-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .heads {
    display: flex;
    justify-content: space-between;
    padding-bottom: 6px;
    color: var(--ink-subtle);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    border-top: 1px solid var(--hairline);
  }
  .what {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .small {
    font-size: 12px;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .real {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding: 6px 0;
  }
  .box {
    display: flex;
    align-items: center;
    gap: 4px;
    border-bottom: 1.5px solid var(--accent);
  }
  .box input {
    width: 112px;
    height: 30px;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .box input:focus {
    outline: none;
  }
  .diff {
    font-size: 11px;
    color: var(--accent);
  }
  .diff.bad {
    color: var(--negative);
  }
  .same {
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
    color: var(--ink-muted);
    font: inherit;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .note {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }
  .ink {
    color: var(--ink);
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
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .save:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
