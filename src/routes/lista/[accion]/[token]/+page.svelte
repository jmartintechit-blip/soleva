<script lang="ts">
  import Logo from '#lib/components/Logo.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const confirmar = $derived(data.accion === 'confirmar');
</script>

<svelte:head>
  <title>{confirmar ? 'Confirmar email' : 'Salir de la lista'} · Soleva</title>
</svelte:head>

<main>
  <div class="sv-glow" aria-hidden="true"></div>
  <a href="/" aria-label="Soleva, inicio" class="home"><Logo /></a>
  <div class="sv-enter content">
    {#if form?.done}
      <h1 class="title-lg">{confirmar ? 'Estás dentro' : 'Te hemos borrado'}</h1>
      <p class="body sv-muted">
        {confirmar
          ? 'Te escribimos cuando abramos. Puedes salir de la lista cuando quieras desde el enlace del correo.'
          : 'Ya no estás en la lista y no guardamos tu email.'}
      </p>
    {:else if form}
      <h1 class="title-lg">Este enlace ya no vale</h1>
      <p class="body sv-muted">
        Puede que ya lo hayas usado o que hayan pasado más de 7 días. Puedes apuntarte otra vez
        desde la portada.
      </p>
    {:else}
      <h1 class="title-lg">{confirmar ? 'Confirma tu email' : '¿Salir de la lista?'}</h1>
      <p class="body sv-muted">
        {confirmar
          ? 'Un toque más y te avisamos cuando abramos Soleva.'
          : 'Borraremos tu email de la lista de espera.'}
      </p>
      <form method="POST">
        <button class="sv-btn sv-btn--primary"
          >{confirmar ? 'Confirmar' : 'Salir de la lista'}</button
        >
      </form>
    {/if}
    <a class="sv-btn sv-btn--ghost" href="/">Ir a la portada</a>
  </div>
</main>

<style>
  main {
    position: relative;
    overflow: hidden;
    min-height: 100dvh;
    box-sizing: border-box;
    max-width: 420px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-7);
  }
  @media (min-width: 540px) {
    main {
      overflow: visible;
    }
  }
  .home {
    position: relative;
    color: var(--ink);
    text-decoration: none;
  }
  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  h1,
  p,
  form {
    margin: 0;
  }
  form .sv-btn,
  .content > .sv-btn {
    width: 100%;
  }
</style>
