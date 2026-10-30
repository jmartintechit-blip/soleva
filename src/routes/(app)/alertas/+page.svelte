<script lang="ts">
  import { enhance } from '$app/forms';
  import { describe } from '#lib/alerts.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const shown = $derived(data.alerts.map((a) => ({ ...a, text: describe(a, data.today) })));
  const hot = (kind: string) => kind === 'sin_saldo' || kind === 'plan_supera';
</script>

<svelte:head>
  <title>Alertas · Soleva</title>
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
  <span class="sv-label">Alertas</span>
  <span class="spacer"></span>
</header>

<div class="page">
  <section class="f1 stack">
    <h1 class="title">
      {shown.length === 0
        ? 'Nada que mirar'
        : shown.length === 1
          ? '1 cosa que mirar'
          : `${shown.length} cosas que mirar`}
    </h1>
    <p class="sv-muted body">Sobre tu plan, con tus números. Qué hacer lo decides tú.</p>
  </section>

  {#if shown.length}
    <section class="f2 list">
      {#each shown as a (a.id)}
        <article>
          <span class="dot" class:hot={hot(a.kind)} aria-hidden="true"></span>
          <div class="text">
            {#if a.text.where}<span class="where">{a.text.where}</span>{/if}
            <h2>{a.text.title}</h2>
            <p class="sv-muted">{a.text.body}</p>
            <div class="actions">
              <a href={a.text.href}>{a.text.action}</a>
              <form method="POST" action="?/ocultar" use:enhance>
                <input type="hidden" name="id" value={a.id} />
                <button>Ocultar</button>
              </form>
            </div>
          </div>
        </article>
      {/each}
    </section>
  {/if}

  <p class="sv-legal">
    Soleva avisa de tu plan; no recomienda comprar, vender ni cambiar productos.
  </p>
</div>

<style>
  h1,
  h2,
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
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-width: 640px;
    margin-inline: auto;
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
  }
  .list {
    display: flex;
    flex-direction: column;
  }
  article {
    display: flex;
    gap: 14px;
    padding: 16px 0;
    border-top: 1px solid var(--hairline);
  }
  .dot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    margin-top: 6px;
    border-radius: 50%;
    background: var(--ink-subtle);
  }
  .dot.hot {
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }
  .text {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .where {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-subtle);
  }
  h2 {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.3;
  }
  .text p {
    font-size: 13px;
    line-height: 1.5;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-top: 2px;
  }
  .actions a {
    min-height: 24px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    text-underline-offset: 3px;
    text-decoration-color: var(--hairline-strong);
  }
  .actions button {
    min-height: 24px;
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--ink-subtle);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .actions button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .f1,
  .f2 {
    animation: sv-fade-up 0.8s var(--ease-out) both;
  }
  .f2 {
    animation-delay: 0.1s;
  }
  @media (prefers-reduced-motion: reduce) {
    .f1,
    .f2 {
      animation: none;
    }
  }
</style>
