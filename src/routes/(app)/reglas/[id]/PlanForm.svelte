<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { formatEuros, parseEuros } from '#lib/engine/money.ts';
  import type { AutoRuleRow } from '#lib/server/auto-rules.ts';
  import type { Product } from '#lib/server/market/search.ts';

  // b12/RPlan: several products bought with one account's cash. Soleva writes each buy down at
  // that day's close; it executes nothing. Products are searched in the provider's order.
  interface Props {
    rule: AutoRuleRow | null;
    today: string;
    context: {
      account: { id: string; name: string; cash: number };
      monthlyIn: number;
      others: { id: string; name: string }[];
    };
    legs: { instrumentId: string; name: string; isin: string | null; cents: number }[];
    form: {
      values?: Record<string, string>;
      legs?: { id: string; name: string; amount: string }[];
      errors?: Record<string, string>;
    } | null;
  }
  let { rule, today, context, legs: saved, form }: Props = $props();

  const FREQS = [
    { f: 'semanal', label: 'Semanal', total: 'Total por semana', perMonth: 52 / 12 },
    { f: 'quincenal', label: 'Quincenal', total: 'Total cada vez', perMonth: 26 / 12 },
    { f: 'mensual', label: 'Mensual', total: 'Total al mes', perMonth: 1 },
  ];
  const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const eur = (cents: number) => formatEuros(cents, { withCents: true });
  const typed = (cents: number) => eur(cents).replace(' €', '');
  const weekdayOf = (d: string) => String(((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1);

  const v = untrack(() => form?.values ?? null);
  const r0 = untrack(() => rule);
  const t0 = untrack(() => today);
  let frequency = $state(v?.frequency ?? r0?.frequency ?? 'semanal');
  let day = $state(
    v?.day ??
      (r0?.frequency === 'quincenal'
        ? weekdayOf(r0.startOn)
        : r0?.day
          ? String(r0.day)
          : (v?.frequency ?? r0?.frequency) === 'mensual'
            ? String(Number(t0.slice(8, 10)))
            : '1'),
  );
  let shortfall = $state(v?.shortfall ?? r0?.shortfall ?? 'no_comprar');
  let shortfallAccount = $state(
    v?.shortfallAccount ?? r0?.shortfallAccountId ?? untrack(() => context.others[0]?.id) ?? '',
  );
  let legs = $state(
    untrack(
      () =>
        form?.legs?.map((l) => ({ id: l.id, name: l.name, isin: '', amount: l.amount })) ??
        saved.map((l) => ({
          id: l.instrumentId,
          name: l.name,
          isin: l.isin ?? '',
          amount: typed(l.cents),
        })),
    ),
  );

  let lastFreq = untrack(() => frequency);
  $effect(() => {
    if (frequency === lastFreq) return;
    if (frequency === 'mensual') day = String(Number(t0.slice(8, 10)));
    else if (lastFreq === 'mensual') day = '1';
    lastFreq = frequency;
  });

  // «Añadir producto al plan»: the search, then the product goes in at its euro listing.
  let searching = $state(false);
  let q = $state('');
  let found = $state<Product[] | null>([]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function search() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (q.trim().length < 2) return (found = []);
      const res = await fetch(`/reglas/buscar?q=${encodeURIComponent(q)}`).catch(() => null);
      found = res?.ok ? await res.json() : null;
    }, 250);
  }
  function add(p: Product) {
    legs.push({ id: `sym:${p.listings[0]!.symbol}`, name: p.name, isin: p.isin ?? '', amount: '' });
    searching = false;
    q = '';
    found = [];
  }

  const freq = $derived(FREQS.find((x) => x.f === frequency) ?? FREQS[0]!);
  const total = $derived(legs.reduce((s, l) => s + (parseEuros(l.amount) ?? 0), 0));
  const monthly = $derived(Math.round(total * freq.perMonth));
  const otherName = $derived(context.others.find((o) => o.id === shortfallAccount)?.name ?? '');
  const warning = $derived.by(() => {
    if (!total) return null;
    const diff = monthly - context.monthlyIn;
    if (diff <= 0)
      return {
        bad: false,
        text: `Entran ${eur(context.monthlyIn)} al mes: sobran ${eur(-diff)}, que se quedan como efectivo.`,
      };
    const months = Math.max(0, Math.floor(context.account.cash / diff));
    const when = new Date(`${t0.slice(0, 7)}-01T00:00:00Z`);
    when.setUTCMonth(when.getUTCMonth() + months);
    const month = when.toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' });
    const then =
      shortfall === 'otra_cuenta'
        ? `lo que falte saldrá de ${otherName || 'la otra cuenta'}.`
        : 'las compras que no quepan no se harán y te avisaremos.';
    return {
      bad: true,
      text: `${context.monthlyIn ? `Entran ${eur(context.monthlyIn)} al mes en esta cuenta` : 'No entra dinero en esta cuenta con ninguna regla'}: faltan ${eur(diff)} al mes. Hacia ${month} el efectivo no llegará: ${then}`,
    };
  });
  const errors = $derived(form?.errors ?? {});
</script>

<div class="page">
  <header class="top">
    <a
      class="back"
      href="/cuentas/{context.account.id}"
      aria-label="Volver a {context.account.name}"
    >
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
    <span class="sv-label">Plan de inversión</span>
    <span class="spacer"></span>
  </header>

  <form method="POST" action="?/guardar_plan" use:enhance class="grid" novalidate>
    <input type="hidden" name="account" value={context.account.id} />
    <input type="hidden" name="start" value={rule?.startOn ?? ''} />
    <div class="main sv-enter">
      <h1>Plan en {context.account.name}</h1>

      <div class="sv-seg seg" role="radiogroup" aria-label="Cada cuánto">
        {#each FREQS as x (x.f)}
          <label class="sv-seg__item" class:on={frequency === x.f}
            ><input
              type="radio"
              name="frequency"
              value={x.f}
              bind:group={frequency}
            />{x.label}</label
          >
        {/each}
      </div>

      <div class="rows">
        <label class="row"
          ><span class="sv-muted">{frequency === 'mensual' ? 'El día' : 'Cada'}</span>
          <select name="day" bind:value={day}>
            {#if frequency === 'mensual'}
              {#each Array.from({ length: 30 }, (_, i) => i + 1) as d (d)}<option value={String(d)}
                  >{d} de cada mes</option
                >{/each}
              <option value="31">el último día</option>
            {:else}
              {#each WEEKDAYS as w, i (w)}<option value={String(i + 1)}
                  >{frequency === 'quincenal' ? `2 semanas, ${w}` : w}</option
                >{/each}
            {/if}
          </select></label
        >
        {#if errors.day}<span class="err" role="alert">{errors.day}</span>{/if}
        <div class="row">
          <span class="sv-muted">Sale de</span><span>Efectivo de {context.account.name}</span>
        </div>
      </div>

      <div class="block">
        <span class="strong">Si no hay efectivo suficiente</span>
        <div class="sv-seg seg" role="radiogroup" aria-label="Si no hay efectivo suficiente">
          <label class="sv-seg__item" class:on={shortfall === 'no_comprar'}
            ><input type="radio" name="shortfall" value="no_comprar" bind:group={shortfall} />No
            comprar y avisarme</label
          >
          <label class="sv-seg__item" class:on={shortfall === 'otra_cuenta'}
            ><input
              type="radio"
              name="shortfall"
              value="otra_cuenta"
              bind:group={shortfall}
            />Cobrarlo de otra cuenta</label
          >
        </div>
        {#if shortfall === 'otra_cuenta'}
          <label class="row"
            ><span class="sv-muted">Cobrarlo de</span><select
              name="shortfall_account"
              bind:value={shortfallAccount}
            >
              {#each context.others as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
            </select></label
          >
        {/if}
        <span class="sv-muted small"
          >{shortfall === 'otra_cuenta'
            ? 'Si un día no llega, Soleva pasa el importe de esa compra desde la cuenta que elijas y compra.'
            : 'Si un día no llega, esa compra queda como no ejecutada, sin participaciones, y te avisamos. Un bróker no deja el efectivo en negativo.'}</span
        >
        {#if errors.shortfall}<span class="err" role="alert">{errors.shortfall}</span>{/if}
      </div>
    </div>

    <div class="side sv-enter">
      <section class="products" aria-labelledby="products">
        <h2 id="products" class="sv-label">Productos</h2>
        {#each legs as l, i (l.id + i)}
          <div class="leg">
            <input type="hidden" name="leg_id" value={l.id} />
            <input type="hidden" name="leg_name" value={l.name} />
            <span class="what"
              ><span class="name">{l.name}</span>{#if l.isin}<span class="sv-muted mono"
                  >{l.isin}</span
                >{/if}</span
            >
            <span class="box"
              ><input
                name="leg_amount"
                bind:value={l.amount}
                inputmode="decimal"
                autocomplete="off"
                aria-label="Importe de {l.name}"
              /> €</span
            >
            <button
              type="button"
              class="remove"
              aria-label="Quitar {l.name}"
              onclick={() => legs.splice(i, 1)}>×</button
            >
          </div>
        {/each}
        {#if searching}
          <div class="search">
            <input
              bind:value={q}
              oninput={search}
              autocomplete="off"
              aria-label="Busca por nombre, ISIN o ticker"
              placeholder="Nombre, ISIN o ticker"
            />
            {#if found === null}
              <p class="sv-muted small">La búsqueda no responde ahora. Prueba en un momento.</p>
            {:else}
              {#each found as p (p.name)}
                <button type="button" class="found" onclick={() => add(p)}
                  ><span class="name">{p.name}</span><span class="sv-muted mono"
                    >{p.isin ?? p.listings[0]!.symbol} · {p.listings[0]!.market}</span
                  ></button
                >
              {/each}
            {/if}
          </div>
        {:else}
          <button type="button" class="add" onclick={() => (searching = true)}
            >+ Añadir producto al plan</button
          >
        {/if}
        {#if errors.legs}<span class="err" role="alert">{errors.legs}</span>{/if}
      </section>

      <section class="totals" aria-live="polite">
        <div class="line">
          <span>{freq.total}</span><span class="num strong">{eur(total)}</span>
        </div>
        <div class="line sv-muted">
          <span>De media al mes</span><span class="num">{eur(monthly)}</span>
        </div>
        {#if warning}<p class="small" class:warn={warning.bad} class:sv-muted={!warning.bad}>
            {warning.text}
          </p>{/if}
      </section>

      <div class="end">
        <button class="sv-btn sv-btn--primary save">Guardar plan</button>
        <span class="subtle small"
          >Soleva apunta cada compra al precio de cierre de ese día. No ejecuta nada en tu bróker.</span
        >
      </div>
    </div>
  </form>

  {#if rule}
    <div class="actions">
      <form method="POST" action="?/pausar_regla" use:enhance>
        <input type="hidden" name="active" value={String(!rule.active)} />
        <button class="sv-btn sv-btn--ghost sv-btn--sm"
          >{rule.active ? 'Pausar' : 'Reanudar'}</button
        >
      </form>
      <form method="POST" action="?/borrar_regla" use:enhance>
        <button class="sv-btn sv-btn--ghost sv-btn--sm danger">Borrar</button>
      </form>
    </div>
  {/if}
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
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.025em;
  }
  h2 {
    margin: 0;
  }
  .grid,
  .main,
  .side,
  .block,
  .products,
  .totals {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .grid {
    gap: var(--space-6);
  }
  input,
  select {
    font: inherit;
    color: var(--ink);
    background: transparent;
    border: 0;
  }
  input:focus,
  select:focus {
    outline: none;
  }
  select:focus-visible {
    box-shadow: 0 1.5px 0 var(--accent);
  }
  select option {
    background: var(--bg);
  }
  .seg {
    display: flex;
  }
  .seg .sv-seg__item {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 0 8px;
    text-align: center;
  }
  .seg .sv-seg__item.on {
    background: var(--ink);
    color: var(--bg);
    font-weight: 600;
  }
  .sv-seg__item input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .sv-seg__item:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    border-bottom: 1px solid var(--hairline);
    font-size: 14px;
  }
  .row select {
    text-align: right;
    min-width: 0;
    height: 36px;
    font-weight: 500;
  }
  .strong {
    font-weight: 600;
  }
  .small {
    font-size: 12px;
    line-height: 1.45;
    margin: 0;
  }
  .subtle {
    color: var(--ink-subtle);
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .leg {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    border-bottom: 1px solid var(--hairline);
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
  .box {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--ink-muted);
    border-bottom: 1.5px solid var(--hairline-strong);
  }
  .box:focus-within {
    border-bottom-color: var(--accent);
  }
  .box input {
    width: 72px;
    height: 32px;
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .remove,
  .add,
  .found {
    background: transparent;
    border: 0;
    color: var(--ink-muted);
    font: inherit;
    cursor: pointer;
  }
  .remove {
    width: 32px;
    height: 32px;
    font-size: 18px;
  }
  .add {
    text-align: left;
    min-height: 44px;
    color: var(--accent);
    font-size: 14px;
    font-weight: 500;
  }
  .search {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .search input {
    height: 40px;
    border-bottom: 1.5px solid var(--accent);
    font-size: 15px;
  }
  .found {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    min-height: 48px;
    padding: 6px 0;
    border-bottom: 1px solid var(--hairline);
    color: var(--ink);
  }
  .found:hover .name,
  .found:focus-visible .name {
    color: var(--accent);
  }
  .line {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .warn {
    color: var(--accent);
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
  .actions {
    display: flex;
    gap: 10px;
    justify-content: center;
  }
  .danger {
    color: var(--negative);
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
      grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
      gap: var(--space-7);
      align-items: start;
    }
  }
</style>
