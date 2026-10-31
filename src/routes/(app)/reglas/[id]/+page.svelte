<script lang="ts">
  import Legacy from './Legacy.svelte';
  import RuleForm from './RuleForm.svelte';
  import type { PageProps } from './$types';

  // On the ledger, b12/RRegla; before the cut-over, v0's rule.
  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.ledger?.rule?.name ?? 'Nueva regla'} · Soleva</title>
</svelte:head>

{#if data.ledger}
  <RuleForm
    rule={data.ledger.rule}
    accounts={data.ledger.accounts}
    today={data.ledger.today}
    form={form && 'values' in form ? (form as Parameters<typeof RuleForm>[1]['form']) : null}
  />
{:else}
  <Legacy {data} {form} />
{/if}
