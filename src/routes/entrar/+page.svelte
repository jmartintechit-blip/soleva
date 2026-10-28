<script lang="ts">
  import Logo from '#lib/components/Logo.svelte';
  import type { PageProps } from './$types';

  let { form }: PageProps = $props();
</script>

<svelte:head>
  <title>Entrar · Soleva</title>
</svelte:head>

<main>
  <div class="sv-glow" aria-hidden="true"></div>
  <Logo />

  {#if form?.sent}
    <form method="POST" action="?/verificar" class="sv-enter">
      <h1 class="title-lg">Revisa tu email</h1>
      <p class="body sv-muted">
        Te hemos mandado un código de 6 cifras a {form.email}. Caduca en 10 minutos.
      </p>
      <input type="hidden" name="email" value={form.email} />
      <label class="sv-field">
        <span class="sv-field__label">Código</span>
        <span class="sv-field__box">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="sv-field__input"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9 ]*"
            maxlength="7"
            required
            autofocus
          />
        </span>
      </label>
      {#if form.error}<p class="sv-pill sv-pill--neg" role="alert">
          <span class="sv-pill__dot"></span>{form.error}
        </p>{/if}
      <button class="sv-btn sv-btn--primary">Entrar</button>
      <a class="sv-btn sv-btn--ghost" href="/entrar">Usar otro email</a>
    </form>
  {:else}
    <form method="POST" action="?/enviar" class="sv-enter">
      <h1 class="title-lg">Entra en Soleva</h1>
      <p class="body sv-muted">Te mandamos un código a tu email. Sin contraseñas.</p>
      <label class="sv-field">
        <span class="sv-field__label">Email</span>
        <span class="sv-field__box">
          <input
            class="sv-field__input"
            type="email"
            name="email"
            autocomplete="email"
            value={form?.email ?? ''}
            required
          />
        </span>
      </label>
      {#if form?.error}<p class="sv-pill sv-pill--neg" role="alert">
          <span class="sv-pill__dot"></span>{form.error}
        </p>{/if}
      <button class="sv-btn sv-btn--primary">Enviarme el código</button>
    </form>
  {/if}
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
  form {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  h1,
  p {
    margin: 0;
  }
  .sv-pill {
    align-self: flex-start;
  }
</style>
