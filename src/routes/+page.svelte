<script lang="ts">
  import { page } from '$app/state';
  import Logo from '#lib/components/Logo.svelte';
  import Calculator from '#lib/components/web/Calculator.svelte';
  import HeroPreview from '#lib/components/web/HeroPreview.svelte';
  import WaitlistForm from '#lib/components/web/WaitlistForm.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const pillars = [
    {
      icon: '⟳',
      title: 'Reglas que trabajan solas',
      body: 'Apunta una vez tu nómina, tus gastos fijos y lo que inviertes. Cada mes, Soleva propone tus saldos y tú confirmas en un minuto.',
    },
    {
      icon: '◠',
      title: 'El futuro, gratis y honesto',
      body: 'Ve dónde estarás en 5, 10 o 20 años, con escenarios prudente, base y optimista y los supuestos a la vista. Sin letra pequeña.',
    },
    {
      icon: '◎',
      title: 'Sin conectar tu banco',
      body: 'Ni contraseñas ni accesos a tus cuentas. Tú decides qué apuntas, y puedes exportarlo o borrarlo cuando quieras.',
    },
  ];

  const steps = [
    {
      n: '01',
      title: 'Apunta tus cuentas',
      body: 'Banco, bróker, cuenta remunerada, tu coche. Un saldo por cuenta y listo.',
    },
    {
      n: '02',
      title: 'Crea tus reglas',
      body: 'Lo que entra, lo que sale y lo que mueves cada mes. Soleva lo proyecta al instante.',
    },
    {
      n: '03',
      title: 'Cierra el mes en 1 minuto',
      body: 'Revisa los saldos que proponen tus reglas, corrige si hace falta y mira cómo vas.',
    },
  ];

  const privacy = [
    {
      title: 'Sin conexión bancaria',
      body: 'Soleva nunca te pide la contraseña de tu banco ni de tu bróker.',
    },
    {
      title: 'Exporta y borra con un toque',
      body: 'Tus datos salen contigo en CSV cuando quieras. Y si te vas, se borran.',
    },
    {
      title: 'Sin anuncios ni venta de datos',
      body: 'Vivimos de los planes de pago, no de lo que sabemos de ti.',
    },
    { title: 'Datos en la Unión Europea', body: 'Cifrados y alojados en servidores de la UE.' },
  ];
</script>

<svelte:head>
  <title>Soleva · Tu patrimonio, en piloto automático</title>
  <meta
    name="description"
    content="Apunta una vez cómo entra y sale tu dinero. Soleva mantiene tus saldos al día y te enseña dónde estarás dentro de 10 años. Sin conectar tu banco."
  />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Soleva · Tu patrimonio, en piloto automático" />
  <meta
    property="og:description"
    content="Apunta una vez cómo entra y sale tu dinero y mira dónde estarás dentro de 10 años. Sin conectar tu banco."
  />
  <meta property="og:image" content="{page.url.origin}/og.png" />
  <meta property="og:image:width" content="1280" />
  <meta property="og:image:height" content="640" />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="page">
  <div class="sunrise" aria-hidden="true"></div>
  <div class="wrap">
    <header>
      <a href="/" class="home" aria-label="Soleva, inicio"><Logo size={32} /></a>
      <nav aria-label="Secciones">
        <a class="link" href="#como">Cómo funciona</a>
        <a class="link" href="#calculadora">Calculadora</a>
        <a class="link" href="#privacidad">Privacidad</a>
        <a class="sv-btn sv-btn--primary cta" href="#lista">Únete a la lista</a>
      </nav>
    </header>

    <section class="hero">
      <div class="hero__text">
        <span class="sv-label sv-enter sv-enter-1">Pronto en iPhone, Android y web</span>
        <h1 class="display sv-enter sv-enter-2">
          Tu patrimonio, en piloto <span class="sun">automático</span>.
        </h1>
        <p class="lede sv-enter sv-enter-3">
          Apunta una vez cómo entra y sale tu dinero. Soleva mantiene tus saldos al día y te enseña
          dónde estarás dentro de 10 años. Sin conectar tu banco.
        </p>
        <div id="lista" class="lista sv-enter sv-enter-4">
          <WaitlistForm open={data.waitlistOpen} {form} />
          <span class="body-sm sv-subtle">
            Gratis para empezar · 14 días de prueba en los planes de pago · Sin spam
          </span>
        </div>
      </div>
      <div class="hero__device sv-enter sv-enter-3"><HeroPreview /></div>
    </section>

    <section class="pillars" aria-label="Por qué Soleva">
      {#each pillars as p (p.title)}
        <div class="pillar">
          <span class="pillar__icon" aria-hidden="true">{p.icon}</span>
          <h2>{p.title}</h2>
          <p class="body sv-muted">{p.body}</p>
        </div>
      {/each}
    </section>

    <section id="como" class="como">
      <div class="heading">
        <span class="sv-label">Cómo funciona</span>
        <h2 class="section-title">Tres pasos. Luego, un minuto al mes.</h2>
      </div>
      <ol>
        {#each steps as s (s.n)}
          <li>
            <span class="step__n">{s.n}</span>
            <h3>{s.title}</h3>
            <p class="body sv-muted">{s.body}</p>
          </li>
        {/each}
      </ol>
    </section>

    <section id="calculadora" class="calculadora">
      <div class="calc-glow" aria-hidden="true"></div>
      <Calculator />
    </section>

    <section id="privacidad" class="privacidad">
      <div class="heading">
        <span class="sv-label">Privacidad</span>
        <h2 class="section-title">Tu dinero es tuyo. Tus datos, también.</h2>
      </div>
      <ul>
        {#each privacy as q (q.title)}
          <li>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <span>
              <span class="item__title">{q.title}</span>
              <span class="body sv-muted">{q.body}</span>
            </span>
          </li>
        {/each}
      </ul>
    </section>

    <footer>
      <div class="footer__brand">
        <Logo size={26} />
        <p class="body-sm sv-subtle">
          Soleva es una herramienta de planificación personal. No mueve dinero, no es un asesor
          financiero y no recomienda productos de inversión. Las proyecciones son estimaciones
          basadas en los supuestos que eliges.
        </p>
      </div>
      <nav class="footer__links" aria-label="Legal">
        <a class="link" href="/aviso-legal">Aviso legal</a>
        <a class="link" href="/privacidad">Privacidad</a>
        <span class="sv-subtle">© 2026 Soleva</span>
      </nav>
    </footer>
  </div>
</div>

<style>
  .page {
    position: relative;
    overflow: hidden;
  }
  .sunrise {
    position: absolute;
    left: 10%;
    right: 10%;
    top: -420px;
    height: 900px;
    border-radius: 50%;
    background: radial-gradient(closest-side, var(--accent-glow), transparent);
    pointer-events: none;
    animation: sunrise 1.6s var(--ease-out) 0.1s both;
  }
  @keyframes sunrise {
    from {
      transform: translateY(60px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sunrise {
      animation: none;
    }
  }
  .wrap {
    position: relative;
    max-width: 1200px;
    margin: 0 auto;
    padding-inline: max(16px, 4%);
  }
  h1,
  h2,
  h3,
  p,
  ol,
  ul {
    margin: 0;
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding-block: 24px;
  }
  .home {
    color: var(--ink);
    text-decoration: none;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 24px;
    font-size: 15px;
  }
  .link {
    color: var(--ink-muted);
    text-decoration: none;
    transition: color var(--duration-fast) var(--ease-standard);
  }
  .link:hover {
    color: var(--ink);
  }
  .link:focus-visible,
  .home:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
  .cta {
    min-height: 42px;
    padding: 0 18px;
  }
  /* On phones the sections are one scroll away; keep the header to one line. */
  @media (max-width: 640px) {
    header .link {
      display: none;
    }
  }

  .hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 56px;
    padding-block: 72px 96px;
  }
  .hero__text {
    flex: 1 1 460px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 26px;
  }
  .display {
    font-size: clamp(44px, 6.4vw, 88px);
    letter-spacing: -0.045em;
    line-height: 0.98;
    text-wrap: balance;
  }
  .sun {
    color: var(--accent);
  }
  .lede {
    font-size: 19px;
    line-height: 1.55;
    color: var(--ink-muted);
    max-width: 34em;
  }
  .lista {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 480px;
  }
  .hero__device {
    flex: 0 1 360px;
    min-width: 0;
    margin: 0 auto;
  }

  .pillars {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 40px;
    padding-block: 24px 96px;
  }
  .pillar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 24px;
    border-top: 1px solid var(--hairline);
  }
  .pillar__icon {
    color: var(--accent);
    font-size: 22px;
    line-height: 1;
  }
  .pillar h2 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .como,
  .privacidad {
    padding-block: 48px 96px;
    border-top: 1px solid var(--line);
  }
  .como {
    display: flex;
    flex-direction: column;
    gap: 40px;
  }
  .heading {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 640px;
  }
  .section-title {
    font-size: clamp(32px, 4vw, 48px);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.05;
    text-wrap: balance;
  }
  .como ol {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 32px;
  }
  .como li {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 20px;
    border-top: 2px solid var(--accent);
  }
  .step__n {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--accent);
  }
  .como h3 {
    font-size: 20px;
    font-weight: 600;
  }

  .calculadora {
    position: relative;
    padding-block: 56px 96px;
    border-top: 1px solid var(--hairline);
  }
  .calc-glow {
    position: absolute;
    right: -10%;
    top: 0;
    width: 60%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(closest-side, var(--accent-soft), transparent);
    pointer-events: none;
  }
  .calculadora > :global(:not(.calc-glow)) {
    position: relative;
  }

  .privacidad {
    display: flex;
    flex-wrap: wrap;
    gap: 40px;
  }
  .privacidad .heading {
    flex: 1 1 360px;
    min-width: 0;
  }
  .privacidad ul {
    flex: 1 1 420px;
    min-width: 0;
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .privacidad li {
    display: flex;
    gap: 14px;
    padding: 18px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .privacidad li > span {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .privacidad svg {
    flex: 0 0 auto;
    margin-top: 2px;
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .item__title {
    font-size: 17px;
    font-weight: 600;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 24px;
    padding-block: 32px 48px;
    border-top: 1px solid var(--line);
  }
  .footer__links {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 16px;
    font-size: 13px;
  }
  .footer__brand {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 560px;
  }
</style>
