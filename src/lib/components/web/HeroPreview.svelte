<script lang="ts">
  import { onMount } from 'svelte';
  import { formatEuros } from '#lib/engine/money.ts';
  import { projectionPaths } from './chart.ts';

  // Example data, labelled as such on the screen.
  const chart = projectionPaths({ startCents: 1_240_000, monthlyCents: 30_000 }, 10, 316, 160);
  let shown = $state(chart.value);

  // Count up from 0 (quart-out), unless the visitor asked for less motion.
  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now() + 400;
    const duration = 1600;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      shown = chart.value * (1 - (1 - p) ** 4);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    shown = 0;
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="device">
  <div class="sv-glow" aria-hidden="true"></div>
  <span class="caption-top">Tu patrimonio dentro de 10 años</span>
  <span class="value sv-num">{formatEuros(shown)}</span>
  <span class="meta">En euros de hoy · escenario base</span>
  <svg viewBox="0 0 316 160" width="100%" role="img" aria-label="Ejemplo de proyección a 10 años">
    <defs>
      <linearGradient id="hero-band" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity=".22" />
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d={chart.band} fill="url(#hero-band)" />
    <path
      class="sv-draw"
      pathLength="1"
      d={chart.line}
      fill="none"
      stroke="var(--accent)"
      stroke-width="2.5"
      stroke-linecap="round"
    />
    <circle class="sv-halo" cx={chart.end.x} cy={chart.end.y} r="12" fill="var(--accent)" />
    <circle cx={chart.end.x} cy={chart.end.y} r="5" fill="var(--accent)" />
  </svg>
  <span class="sv-pill sv-pill--ok"><span class="sv-pill__dot"></span>Vas en camino</span>
  <span class="sv-legal note">Datos de ejemplo · Estimación, no asesoramiento</span>
</div>

<style>
  .device {
    width: 100%;
    max-width: 360px;
    aspect-ratio: 360 / 560;
    border-radius: 48px;
    box-shadow:
      inset 0 0 0 1px var(--line),
      var(--shadow-device);
    box-sizing: border-box;
    padding: 26px 22px;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    position: relative;
    overflow: hidden;
  }
  .device > :not(.sv-glow) {
    position: relative;
  }
  .caption-top,
  .meta {
    font-size: 13px;
    color: var(--ink-muted);
  }
  .meta {
    font-size: 12px;
  }
  .value {
    font-size: 44px;
    font-weight: 600;
    letter-spacing: -0.045em;
    line-height: 1;
  }
  svg {
    display: block;
    height: auto;
  }
  .sv-pill {
    align-self: flex-start;
  }
  .note {
    margin-top: auto;
  }
</style>
