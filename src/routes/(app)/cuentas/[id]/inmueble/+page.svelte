<script lang="ts">
  import PropertyForm from '#lib/components/PropertyForm.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.view.name} · Soleva</title>
</svelte:head>

<PropertyForm view={data.view} debts={data.debts} fromAlta={data.fromAlta} {form} />
