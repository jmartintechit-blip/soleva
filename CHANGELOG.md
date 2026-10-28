# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones: [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Esqueleto con SvelteKit 3 y Svelte 5 para Cloudflare Workers.
- Sistema de diseño Horizonte con las fuentes Geist alojadas en el propio sitio.
- Base de datos Neon Postgres (Frankfurt) con migraciones SQL numeradas y PGlite en los tests.
- Entrada con código de un solo uso por email (Better Auth + Resend), con límite de intentos guardado en la base de datos.
- Página de entrada, rutas privadas con guarda de sesión, navegación inferior en móvil y lateral en escritorio, y página de error en español.
- Política de seguridad de contenidos (CSP) con nonce, HSTS y otras cabeceras de seguridad.
- `npm run usage`: consumo frente a los planes gratuitos de Workers y Neon, con aviso al 70 % y al 90 %.
- CI en GitHub Actions: lint, tipos, formato, tests y build en cada push.
