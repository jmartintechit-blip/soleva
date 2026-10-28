<script lang="ts">
  import Logo from '#lib/components/Logo.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<div class="wrap">
  <header>
    <a href="/" class="home" aria-label="Soleva, inicio"><Logo /></a>
  </header>
  <article class="prose">{@render children()}</article>
  <footer class="body-sm sv-subtle">
    <a href="/aviso-legal">Aviso legal</a> · <a href="/privacidad">Privacidad</a> · © 2026 Soleva
  </footer>
</div>

<style>
  .wrap {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px max(16px, 4%) 48px;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
  .home {
    color: var(--ink);
    text-decoration: none;
  }
  .prose :global(h1) {
    margin: 0 0 var(--space-5);
    font-size: clamp(32px, 4vw, 44px);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.05;
  }
  .prose :global(h2) {
    margin: var(--space-6) 0 var(--space-3);
    padding-top: var(--space-5);
    border-top: 1px solid var(--hairline);
    font-size: 20px;
    font-weight: 600;
  }
  .prose :global(p),
  .prose :global(li) {
    font-size: 15px;
    line-height: 1.6;
    color: var(--ink-muted);
  }
  .prose :global(p) {
    margin: 0 0 var(--space-3);
  }
  .prose :global(ul) {
    margin: 0 0 var(--space-3);
    padding-left: 20px;
  }
  .prose :global(strong) {
    color: var(--ink);
    font-weight: 500;
  }
  footer {
    padding-top: var(--space-5);
    border-top: 1px solid var(--line);
  }
  a {
    color: var(--ink-muted);
  }
  a:hover {
    color: var(--ink);
  }
  a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
