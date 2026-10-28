# Arquitectura

Soleva es una sola aplicación SvelteKit que se despliega como un Cloudflare Worker. El servidor renderiza las páginas (SSR) y responde a los formularios; el navegador recibe poco JavaScript.

```
navegador ──HTTPS──▶ Cloudflare Worker (SvelteKit)
                        ├─ estáticos (_app, fuentes, robots.txt) con _headers
                        ├─ hooks.server.ts: auth bajo demanda + cabeceras de seguridad
                        ├─ /api/auth/*  → Better Auth (código por email, límite de intentos)
                        └─ rutas y form actions ──▶ Neon Postgres (Frankfurt) por WebSocket
                                                └─▶ Resend (código de entrada y lista de espera)
```

## Carpetas

| Ruta                 | Qué hay                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| `src/routes/`        | Páginas y form actions. `(app)/` agrupa las rutas privadas con su guarda de sesión.     |
| `src/lib/engine/`    | Motor: funciones puras sin dependencias (hoy, interés compuesto y euros; reglas en B2). |
| `src/lib/server/`    | Auth, email, acceso a datos y scripts de mantenimiento (`migrate`, `usage`).            |
| `src/lib/styles/`    | `tokens.css` y `componentes.css` del sistema Horizonte, sin tocar.                      |
| `migrations/`        | SQL numerado (`0001_auth.sql`, …), aplicado en orden por `npm run migrate`.             |
| `.github/workflows/` | CI (`ci.yml`) y aviso diario de consumo (`usage.yml`).                                  |

## Decisiones clave

- **Una conexión por petición.** Un Worker no puede reutilizar sockets entre peticiones, así que cada petición que necesita la base de datos abre su `Pool` de Neon y lo cierra al terminar. Las páginas públicas no abren ninguno.
- **Better Auth una vez por isolate.** Crearlo cuesta unos 9 ms de CPU; se reutiliza entre peticiones y sus consultas van al `Pool` de la petición en curso (AsyncLocalStorage).
- **Sin contraseñas.** Workers Free da 10 ms de CPU por petición: un hash de contraseña no cabe. La entrada es por código de un solo uso.
- **Límites en la base de datos.** El límite de intentos de Better Auth se guarda en Postgres porque un Worker no tiene memoria compartida entre peticiones.
- **SQL a mano.** Sin ORM: la interfaz `Db` ejecuta SQL parametrizado; en los tests la implementa PGlite (Postgres en memoria), así que no hacen falta claves reales.
- **Importes en céntimos enteros y porcentajes en puntos básicos** en base de datos, motor, API y exportación.
- **Lista de espera con doble confirmación.** Solo se guarda el hash del enlace; sin confirmar se borra a los 7 días y darse de baja borra la fila. Cerrada en producción hasta revisar los textos legales (`WAITLIST_OPEN`).
- **Aislamiento por usuario.** Todo repositorio recibe el `userId` y filtra por él; lo ajeno responde 404.

## Entornos

| Entorno               | App                            | Base de datos          |
| --------------------- | ------------------------------ | ---------------------- |
| Local (`npm run dev`) | Vite con el entorno de Workers | Rama `dev` de Neon     |
| Producción            | Worker `soleva`                | Rama principal de Neon |
| Tests (`npm test`)    | Vitest                         | PGlite en memoria      |
