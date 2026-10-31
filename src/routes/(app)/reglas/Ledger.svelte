<script lang="ts">
  import { formatEuros } from '#lib/engine/money.ts';
  import type { AutoRuleRow } from '#lib/server/auto-rules.ts';

  // The rules that generate movements, on the ledger: each with what it moves and when.
  let {
    rules,
    names,
    hasAccounts,
  }: { rules: AutoRuleRow[]; names: Record<string, string>; hasAccounts: boolean } = $props();

  const KIND = { transferencia: 'Transferencia', ingreso: 'Ingreso', gasto: 'Gasto', plan: 'Plan' };
  const EVERY: Record<string, string> = {
    semanal: 'a la semana',
    quincenal: 'cada 15 días',
    mensual: 'al mes',
    trimestral: 'al trimestre',
    anual: 'al año',
    una_vez: 'una vez',
  };
  const WEEKDAY = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const when = (r: AutoRuleRow) =>
    r.frequency === 'una_vez'
      ? `el ${new Date(r.startOn).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
      : r.frequency === 'semanal'
        ? `cada ${WEEKDAY[r.day ?? 1]}`
        : r.frequency === 'quincenal'
          ? 'cada 15 días'
          : r.day === 31
            ? 'el último día'
            : `el día ${r.day}`;
  const route = (r: AutoRuleRow) =>
    [r.fromAccountId, r.toAccountId]
      .filter((id): id is string => !!id)
      .map((id) => names[id] ?? '')
      .join(' → ');
  const amount = (r: AutoRuleRow) => (r.kind === 'plan' ? r.legsCents : (r.amountCents ?? 0));
  const sign = (r: AutoRuleRow) =>
    r.kind === 'ingreso' ? '+' : r.kind === 'transferencia' ? '' : '−';
</script>

<header class="sv-enter">
  <div>
    <h1 class="title-lg">Reglas</h1>
    <p class="body sv-muted">
      Cómo entra, sale y se mueve tu dinero. Soleva no mueve dinero: solo apunta lo que tú haces.
    </p>
  </div>
  {#if hasAccounts}
    <a class="sv-btn sv-btn--primary sv-btn--sm" href="/reglas/nueva">Nueva regla</a>
  {/if}
</header>

{#if !hasAccounts}
  <p class="body sv-muted">
    Las reglas mueven dinero entre tus cuentas. <a href="/alta">Mete primero lo que tienes</a>.
  </p>
{:else if !rules.length}
  <p class="body sv-muted">
    Aún no tienes reglas. Empieza por tu nómina, tus gastos fijos y lo que apartas cada mes.
  </p>
{/if}

<section aria-label="Tus reglas">
  {#each rules as r (r.id)}
    <div class="sv-row" class:off={!r.active}>
      <a class="sv-row__main" href="/reglas/{r.id}">
        <span class="sv-row__title">{r.name}</span>
        <span class="sv-row__meta"
          >{KIND[r.kind]} · {when(r)}{route(r) ? ` · ${route(r)}` : ''}{r.active
            ? ''
            : ' · en pausa'}</span
        >
      </a>
      <span class="sv-row__value"
        >{sign(r)}{formatEuros(amount(r), { withCents: true })}
        <span class="sv-muted every">{EVERY[r.frequency]}</span></span
      >
      <form method="POST" action="?/pausar">
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
</style>
