<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { THEMES } from '#lib/labels.ts';
  import Logo from '#lib/components/Logo.svelte';
  import type { LayoutProps } from './$types';

  let { children, data }: LayoutProps = $props();

  // Client-side navigation keeps <html>, so the theme follows the data and leaves with the app.
  $effect(() => {
    document.documentElement.dataset.theme = data.theme;
    return () => {
      document.documentElement.dataset.theme = 'amanecer';
    };
  });

  // Icon paths from the approved screens (escritorio-proyeccion, movil-inicio).
  const nav = [
    {
      href: '/inicio',
      label: 'Inicio',
      icon: 'M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z',
      mobile: true,
    },
    {
      href: '/proyeccion',
      label: 'Proyección',
      icon: 'M3 18c4 0 6-9 9-9s5 5 9 5M3 21h18',
      mobile: true,
    },
    {
      href: '/cierre',
      label: 'Cierre de mes',
      icon: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 3v4M16 3v4M8 13l3 3 5-6',
      mobile: true,
    },
    { href: '/reglas', label: 'Reglas', icon: 'M4 8h13l-3-3M20 16H7l3 3', mobile: true },
    {
      href: '/cuentas',
      label: 'Cuentas',
      icon: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
      mobile: false,
    },
    {
      href: '/ajustes',
      label: 'Ajustes',
      icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
      mobile: true,
    },
  ];
  const current = (href: string) => (page.url.pathname.startsWith(href) ? 'page' : undefined);
</script>

{#snippet icon(d: string, size: number)}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"><path {d} /></svg
  >
{/snippet}

<div class="shell">
  <aside class="sv-sidebar">
    <a href="/inicio" class="home" aria-label="Soleva, inicio"><Logo /></a>
    <nav class="sv-sidebar__group" aria-label="Secciones">
      <span class="sv-sidebar__title">Tu plan</span>
      {#each nav as item (item.href)}
        <a class="sv-sidebar__item" href={item.href} aria-current={current(item.href)}>
          {@render icon(item.icon, 20)}<span>{item.label}</span>
        </a>
      {/each}
    </nav>
    <!-- Theme picker of the approved desktop screen; the same action as in Ajustes. -->
    <!-- Only refresh the data: the default update would move to /ajustes, the action's page. -->
    <form
      class="themes"
      method="POST"
      action="/ajustes?/tema"
      use:enhance={() =>
        async ({ result }) => {
          if (result.type === 'success') await invalidateAll();
        }}
    >
      <span class="sv-muted">Tema</span>
      <span class="dots" role="group" aria-label="Tema de color">
        {#each THEMES as t (t.id)}
          <button
            name="theme"
            value={t.id}
            aria-pressed={data.theme === t.id}
            aria-label="Tema {t.label}"
            title={t.label}
            style:--c={t.color}><span aria-hidden="true"></span></button
          >
        {/each}
      </span>
    </form>
    <form class="sv-sidebar__foot" method="POST" action="/salir">
      <button class="sv-btn sv-btn--ghost sv-btn--sm">Cerrar sesión</button>
    </form>
  </aside>

  <main>
    <div class="sv-glow" aria-hidden="true"></div>
    <div class="content">{@render children()}</div>
  </main>

  <nav class="sv-tabbar" aria-label="Navegación principal">
    {#each nav.filter((item) => item.mobile) as item (item.href)}
      <a
        class="sv-tabbar__item"
        href={item.href}
        aria-label={item.label}
        aria-current={current(item.href)}
      >
        {@render icon(item.icon, 22)}
      </a>
    {/each}
  </nav>
</div>

<style>
  .shell {
    min-height: 100dvh;
    display: flex;
  }
  main {
    position: relative;
    /* clip, not hidden: the glow sticks out 60 px and focusing an input scrolled main sideways. */
    overflow: clip;
    flex: 1 1 auto;
    min-width: 0;
    padding: var(--space-5) var(--space-5) 96px;
  }
  /* As in escritorio-proyeccion: content up to 1160 px, centred in what the sidebar leaves. */
  .content {
    position: relative;
    max-width: 1160px;
    margin-inline: auto;
  }
  .home {
    color: inherit;
    text-decoration: none;
    padding: 0 12px;
  }
  .themes {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    font-size: 13px;
  }
  .themes + .sv-sidebar__foot {
    margin-top: -18px;
  }
  .dots {
    display: flex;
    gap: 4px;
  }
  .dots button {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 1px var(--hairline);
  }
  .dots button span {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--c);
  }
  .dots button[aria-pressed='true'] {
    box-shadow: inset 0 0 0 1.5px var(--c);
  }
  .dots button[aria-pressed='true'] span {
    box-shadow: 0 0 10px var(--c);
  }
  .dots button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .sv-sidebar {
    display: none;
    position: sticky;
    top: 0;
    height: 100dvh;
  }
  .sv-tabbar {
    position: fixed;
    inset: auto 0 0 0;
    background: var(--bg);
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  @media (min-width: 1024px) {
    .sv-sidebar {
      display: flex;
    }
    .sv-tabbar {
      display: none;
    }
    main {
      padding: var(--space-6) var(--space-7);
    }
  }
</style>
