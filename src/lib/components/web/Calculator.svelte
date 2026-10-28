<script lang="ts">
  import { contributed, scenarios } from '#lib/engine/compound.ts';
  import { formatEuros } from '#lib/engine/money.ts';

  let start = $state(10_000);
  let monthly = $state(300);
  let years = $state(10);

  const plan = $derived({
    startCents: start * 100,
    monthlyCents: monthly * 100,
    months: years * 12,
  });
  const result = $derived(scenarios(plan));
  const put = $derived(contributed(plan));
  const gain = $derived(Math.max(0, result.base - put));
  const putPct = $derived(result.base > 0 ? Math.min(100, (put / result.base) * 100) : 100);
</script>

<div class="calc">
  <div class="inputs">
    <div class="heading">
      <span class="sv-label">Calculadora gratis</span>
      <h2>¿Cuánto tendrás si sigues así?</h2>
    </div>
    <div class="control">
      <div class="row">
        <label for="calc-start" class="sv-muted">Lo que tienes hoy</label>
        <span class="value sv-num">{formatEuros(start * 100)}</span>
      </div>
      <input
        id="calc-start"
        class="sv-range"
        type="range"
        min="0"
        max="100000"
        step="500"
        bind:value={start}
      />
    </div>
    <div class="control">
      <div class="row">
        <label for="calc-monthly" class="sv-muted">Lo que inviertes al mes</label>
        <span class="value sv-num">{formatEuros(monthly * 100)} / mes</span>
      </div>
      <input
        id="calc-monthly"
        class="sv-range"
        type="range"
        min="0"
        max="1500"
        step="25"
        bind:value={monthly}
      />
    </div>
    <div class="control">
      <span class="sv-muted body-sm" id="calc-years">Durante</span>
      <div class="sv-seg" role="group" aria-labelledby="calc-years">
        {#each [5, 10, 20] as y (y)}
          <button
            type="button"
            class="sv-seg__item"
            aria-pressed={years === y}
            onclick={() => (years = y)}
          >
            {y} años
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="output">
    <span class="sv-muted body-sm">Tendrías unos</span>
    <span class="result sv-num" aria-live="polite">{formatEuros(result.base)}</span>
    <span class="sv-muted body-sm">
      En euros de hoy · entre <span class="sv-num">{formatEuros(result.prudente)}</span> y
      <span class="sv-num">{formatEuros(result.optimista)}</span>
    </span>
    <div class="sv-split" aria-hidden="true">
      <div class="sv-split__a bar" style:width="{putPct}%"></div>
      <div class="sv-split__b bar" style:width="{100 - putPct}%"></div>
    </div>
    <div class="row body-sm">
      <span
        ><span class="sv-muted">Pones tú</span> <span class="sv-num">{formatEuros(put)}</span></span
      >
      <span>
        <span class="sv-muted">Rentabilidad</span>
        <span class="gain sv-num">+{formatEuros(gain)}</span>
      </span>
    </div>
    <span class="sv-legal">
      Supuestos: 3 %, 6 % y 8 % anual; inflación 2,5 %. Estimación, no asesoramiento.
    </span>
    <a class="sv-btn sv-btn--primary cta" href="#lista">Guárdalo y síguelo en Soleva</a>
  </div>
</div>

<style>
  .calc {
    display: flex;
    flex-wrap: wrap;
    gap: 56px;
  }
  .inputs,
  .output {
    flex: 1 1 340px;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .inputs {
    gap: 22px;
  }
  .output {
    justify-content: center;
    gap: 14px;
  }
  .heading {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font-size: clamp(28px, 3.4vw, 40px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .control:last-child {
    gap: 8px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 14px;
  }
  .value {
    font-weight: 600;
  }
  .result {
    font-size: clamp(44px, 5vw, 64px);
    font-weight: 600;
    letter-spacing: -0.045em;
    line-height: 1;
  }
  .bar {
    transition: width var(--duration-base) var(--ease-out);
  }
  .gain {
    color: var(--accent);
  }
  .cta {
    align-self: flex-start;
  }
  .sv-seg {
    align-self: flex-start;
  }
</style>
