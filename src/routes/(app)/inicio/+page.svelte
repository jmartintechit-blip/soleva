<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Inicio · Soleva</title>
</svelte:head>

<h1 class="title-lg">Inicio</h1>
<p class="body sv-muted">Has entrado como {data.email}. Aquí irá tu patrimonio.</p>
<p class="body"><a href="/cuentas">Tus cuentas</a> · <a href="/reglas">Tus reglas</a></p>
