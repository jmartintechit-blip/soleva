<p align="center"><img src="src/lib/assets/favicon.svg" width="88" alt="Logo de Soleva"></p>

<h1 align="center">Soleva</h1>

<p align="center">Tu patrimonio, en piloto automático. Sin conectar el banco.</p>

<p align="center">
  <a href="https://github.com/jmartintechit-blip/soleva/actions/workflows/ci.yml"><img src="https://github.com/jmartintechit-blip/soleva/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/jmartintechit-blip/soleva/releases"><img src="https://img.shields.io/github/v/release/jmartintechit-blip/soleva?include_prereleases&label=versi%C3%B3n" alt="Versión"></a>
</p>

<p align="center"><a href="README.en.md">English</a></p>

Apuntas una vez cómo entra y sale tu dinero (nómina, aportaciones, gastos fijos) y Soleva te propone tus saldos cada mes y te enseña dónde estarás en 5, 10 o 20 años. Pensada para el inversor joven en España con varias cuentas, fondos o brókers.

> Soleva no mueve dinero, no se conecta a tu banco y no recomienda productos. Toda proyección es una estimación, no asesoramiento.

## Funcionalidades

Hoy (bloque 0, esqueleto):

- Entrada sin contraseña con un código de 6 cifras por email.
- Rutas privadas con sesión, navegación inferior en móvil y lateral en escritorio.
- Sistema de diseño Horizonte, oscuro, con fuentes alojadas en el propio sitio.

En camino (MVP v0): cuentas, reglas de entrada, salida y traspaso, cierre de mes en un minuto, proyección a 5, 10 y 20 años con tres escenarios, semáforo frente a tu plan, exportar tus datos y borrar tu cuenta.

## Stack

TypeScript · SvelteKit 3 + Svelte 5 · Cloudflare Workers · Neon Postgres (Frankfurt) con SQL a mano · Better Auth · Resend · Zod · Vitest + PGlite.

Detalle en [ARCHITECTURE.md](ARCHITECTURE.md).

## Arrancarlo en local

Necesitas Node 24 y una base de datos de [Neon](https://neon.tech) (gratis).

```bash
npm ci
cp .dev.vars.example .dev.vars   # la app: DATABASE_URL y BETTER_AUTH_SECRET
cp .env.example .env             # los scripts: DATABASE_URL
npm run migrate
npm run dev
```

- `BETTER_AUTH_SECRET`: una cadena aleatoria de 32 caracteres o más (`openssl rand -base64 32`).
- Sin `RESEND_API_KEY`, el código de entrada sale en la consola de `npm run dev`.
- `npm test` no necesita claves: usa Postgres en memoria (PGlite).
- `npm run check` pasa lint, tipos, formato, tests y build, igual que el CI.

## Estado

En construcción: bloque 0 de 7 del MVP v0. Ver [CHANGELOG.md](CHANGELOG.md).

## Hoja de ruta

| Bloque                  | Contenido                                                   |
| ----------------------- | ----------------------------------------------------------- |
| 0 · Esqueleto           | Entrada, diseño, base de datos, seguridad, CI y despliegue  |
| 1 · Web pública         | Portada, calculadora de interés compuesto y lista de espera |
| 2 · Motor               | Reglas, cierre y proyección como funciones puras con tests  |
| 3 · Cuentas y reglas    | Crear, editar, pausar y borrar                              |
| 4 · Inicio y proyección | Patrimonio, gráfico y supuestos editables                   |
| 5 · Cierre de mes       | Propuesta, corrección, confirmación e histórico             |
| 6 · Ajustes             | Temas, exportar datos y borrar cuenta                       |
| 7 · Pulido              | Accesibilidad, rendimiento y app instalable                 |

## Seguridad

Ver [SECURITY.md](SECURITY.md) para avisar de una vulnerabilidad.

## Licencia

© 2026 Juan Antonio Martín Nadales. Todos los derechos reservados. El código es público para poder leerlo; ver [LICENSE](LICENSE).

Se desarrolla con asistencia de IA.
