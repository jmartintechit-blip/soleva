<script lang="ts">
  let { size = 30 }: { size?: number } = $props();
</script>

<span class="logo">
  <!-- The brand is always Amanecer, whatever theme the app wears. -->
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" data-theme="amanecer">
    <path class="sv-rise" d="M14 40 A18 18 0 0 1 50 40 Z" fill="var(--accent)" />
    <rect x="6" y="44" width="52" height="3" rx="1.5" fill="var(--ink)" />
  </svg>
  <span class="word">soleva</span>
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .word {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.05em;
  }
</style>
