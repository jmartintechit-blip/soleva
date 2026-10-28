# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones: [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

## [0.1.0] - 2026-10-28

### Añadido

- Esqueleto con SvelteKit 3 y Svelte 5 para Cloudflare Workers.
- Sistema de diseño Horizonte con las fuentes Geist alojadas en el propio sitio.
- Base de datos Neon Postgres (Frankfurt) con migraciones SQL numeradas y PGlite en los tests.
- Entrada con código de un solo uso por email (Better Auth + Resend), con límite de intentos guardado en la base de datos.
- Página de entrada, rutas privadas con guarda de sesión, navegación inferior en móvil y lateral en escritorio, y página de error en español.
- Política de seguridad de contenidos (CSP) con nonce, HSTS y otras cabeceras de seguridad.
- `npm run usage`: consumo frente a los planes gratuitos de Workers y Neon, con aviso al 70 % y al 90 %.
- CI en GitHub Actions: lint, tipos, formato, tests y build en cada push.
- Registro cerrado a una lista de emails (`ALLOWED_EMAILS`) y `noindex` en toda la app hasta la beta.
- Prueba E2E de entrada con Playwright, en CI sobre una rama temporal de Neon copiada de dev.
- Primer despliegue en Cloudflare Workers.

[Sin publicar]: https://github.com/jmartintechit-blip/soleva/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jmartintechit-blip/soleva/releases/tag/v0.1.0
