<script lang="ts">
  let {
    open,
    form,
  }: { open: boolean; form?: { joined?: boolean; email?: string; error?: string } | null } =
    $props();
</script>

{#if !open}
  <p class="sv-pill"><span class="sv-pill__dot"></span>La lista de espera abre muy pronto.</p>
{:else if form?.joined}
  <p class="sv-pill sv-pill--ok" role="status">
    <span class="sv-pill__dot"></span>Revisa tu email y confirma para entrar en la lista.
  </p>
{:else}
  <form method="POST" action="?/unirse">
    <div class="box">
      <label for="waitlist-email" class="visually-hidden">Tu correo</label>
      <input
        id="waitlist-email"
        type="email"
        name="email"
        required
        maxlength="254"
        placeholder="tu@correo.com"
        autocomplete="email"
        value={form?.email ?? ''}
      />
      <button class="sv-btn sv-btn--accent">Quiero probarla</button>
    </div>
    <label class="consent body-sm sv-muted">
      <input type="checkbox" name="consent" required />
      <span>
        Quiero que Soleva me escriba cuando abra. He leído la
        <a href="/privacidad">política de privacidad</a>.
      </span>
    </label>
    {#if form?.error}
      <p class="sv-pill sv-pill--neg" role="alert">
        <span class="sv-pill__dot"></span>{form.error}
      </p>
    {/if}
  </form>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .box {
    display: flex;
    gap: 8px;
    padding: 6px;
    border-radius: var(--radius-pill);
    box-shadow: inset 0 0 0 1px var(--hairline-strong);
  }
  .box:focus-within {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  input[type='email'] {
    flex: 1 1 0;
    min-width: 0;
    height: 46px;
    padding: 0 12px;
    border: 0;
    background: transparent;
    color: var(--ink);
    font-family: inherit;
    font-size: 16px;
    outline: none;
  }
  input[type='email']::placeholder {
    color: var(--ink-subtle);
  }
  .box .sv-btn {
    min-height: 46px;
    padding: 0 18px;
  }
  .consent {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .consent input {
    margin: 3px 0 0;
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }
  .consent a {
    color: var(--ink);
  }
  .consent a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  p {
    margin: 0;
    align-self: flex-start;
  }
</style>
