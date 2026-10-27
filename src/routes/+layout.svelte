<script lang="ts">
  import '@fontsource/geist/latin-400.css';
  import '@fontsource/geist/latin-500.css';
  import '@fontsource/geist/latin-600.css';
  import '@fontsource/geist-mono/latin-400.css';
  import '@fontsource/geist-mono/latin-500.css';
  import '#lib/styles/tokens.css';
  import '#lib/styles/componentes.css';
  import '#lib/styles/base.css';
  import favicon from '#lib/assets/favicon.svg';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
