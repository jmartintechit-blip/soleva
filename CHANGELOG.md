# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones: [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

## [0.7.0] - 2026-10-29

### Añadido

- Ajustes: tema Amanecer, Crepúsculo o Rosé (por dispositivo; la marca y la web siguen en Amanecer), día del recordatorio (1–28) o apagarlo.
- Exportar todo lo apuntado: un JSON completo o un CSV por tabla (cuentas, reglas, cierres, correcciones y ajustes), importes en céntimos.
- Borrar la cuenta de verdad: en cascada con sesiones, cierres y códigos de acceso pendientes, con test.
- Cerrar sesión en este o en todos los dispositivos.

### Cambiado

- Ajustes entra en la barra inferior del móvil.

## [0.6.0] - 2026-10-29

### Añadido

- Cierre de mes: Soleva propone los saldos a partir de tus reglas e intereses; los corriges en línea y confirmas todo de una vez, con el conteo desde el mes anterior.
- Un mes cerrado no se edita: cada corrección posterior queda como enmienda con su motivo y el saldo anterior, también en base de datos (triggers).
- Histórico de meses cerrados con su detalle y sus enmiendas.
- Inicio: evolución del patrimonio de los últimos 12 meses, cambio desde el último cierre y acceso «Cierra {mes}».
- Recordatorio por email el día del mes que toque (por defecto el 1), una sola vez por mes abierto, desde un cron diario.

## [0.5.0] - 2026-10-29

### Añadido

- Lista de espera abierta en solevaapp.com.
- Inicio: patrimonio de hoy con conteo, semáforo, estimación a 10 años y tus cuentas.
- Proyección (móvil y escritorio): escenarios prudente, base y optimista, horizonte de 5, 10 o 20 años, gráfico con rango, «tú aportas / pone la rentabilidad» y tres «¿qué pasa si…?» que recalculan en vivo.
- Supuestos editables por usuario y «Fijar como mi plan» para el semáforo («Vas en camino» / «Algo por debajo del plan», umbral −3 %).

### Cambiado

- En «Nueva regla», Día, Desde y Hasta van plegados en «Más opciones» (por defecto: hoy, este mes, sin fin).
- El job «Free-plan usage» dice en rojo si es el AVISO de consumo o un fallo del script.

## [0.4.0] - 2026-10-29

### Añadido

- Cuentas: crear, editar, archivar y borrar, con saldo en céntimos, valor estimado e interés o depreciación anual (vehículo −15 % por defecto).
- Reglas: listado con interruptor de pausa y hoja «Nueva regla» con plantillas (nómina, gastos fijos, aportación), importe con deslizador, frecuencia, día, desde y hasta, y su efecto estimado a 10 años.
- Importes y porcentajes escritos a la española (`1.250,50`) o con punto decimal.
- Aislamiento por usuario en base de datos: claves foráneas compuestas y 404 para cuentas y reglas ajenas, con tests.

## [0.3.0] - 2026-10-29

### Añadido

- Motor: meses y recurrencias (mensual, trimestral, anual, una vez; día 31 al último día del mes), reglas ordenadas por día, intereses y depreciación por cuenta, patrimonio = activos − deudas.
- Motor: proyección mes a mes en euros de hoy y del momento por escenario, semáforo del plan (umbral −3 %) y tres «¿qué pasa si…?» (más al mes, pausar aportaciones, gasto puntual).
- Tests de invariantes: un traspaso no cambia el patrimonio, los pagos a deudas se topan a lo que se debe e importes siempre en céntimos enteros.
- Aviso legal completo: titular, encaje con la Ley 6/2023 (sin asesoramiento), condiciones de uso, responsabilidad y ley aplicable.
- Política de privacidad completa: responsable, bases legales, plazos, encargados y cookie de sesión.

### Cambiado

- Las sesiones ya no guardan la IP ni el navegador, y la IP de los límites de intentos se borra a partir de los 10 minutos.

## [0.2.0] - 2026-10-28

### Añadido

- Portada pública: titular, vista previa de la proyección, pilares, cómo funciona y privacidad.
- Calculadora de interés compuesto en euros de hoy con escenarios prudente, base y optimista.
- Motor: interés compuesto en céntimos y formato español de euros, con tests.
- Lista de espera con consentimiento, doble confirmación por email y baja que borra el email; cerrada en producción (`WAITLIST_OPEN`).
- Aviso legal y política de privacidad en borrador, con los huecos marcados.
- Imagen para compartir enlaces (1280×640).

### Cambiado

- Better Auth se crea una vez por isolate: la mediana de CPU por petición baja de 11 ms a 1,5 ms.
- El aviso de consumo vigila la mediana de CPU en lugar del p99.

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

[Sin publicar]: https://github.com/jmartintechit-blip/soleva/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/jmartintechit-blip/soleva/releases/tag/v0.5.0
[0.4.0]: https://github.com/jmartintechit-blip/soleva/releases/tag/v0.4.0
[0.3.0]: https://github.com/jmartintechit-blip/soleva/releases/tag/v0.3.0
[0.2.0]: https://github.com/jmartintechit-blip/soleva/releases/tag/v0.2.0
[0.1.0]: https://github.com/jmartintechit-blip/soleva/releases/tag/v0.1.0
