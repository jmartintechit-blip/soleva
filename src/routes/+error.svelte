<script lang="ts">
  import { page } from '$app/state';
  import Logo from '#lib/components/Logo.svelte';
</script>

<svelte:head>
  <title>{page.status === 404 ? 'No encontrado' : 'Error'} · Soleva</title>
</svelte:head>

<main>
  <Logo />
  <p class="sv-label">{page.status}</p>
  <h1 class="title-lg">
    {page.status === 404 ? 'Aquí no hay nada.' : 'Algo ha fallado.'}
  </h1>
  <p class="body sv-muted">
    {page.status === 404
      ? 'La página no existe o no es tuya.'
      : 'No es culpa tuya. Vuelve a intentarlo en un momento.'}
  </p>
  <a class="sv-btn sv-btn--primary" href="/">Ir al principio</a>
</main>

<style>
  main {
    max-width: 420px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
  }
  h1,
  p {
    margin: 0;
  }
</style>
