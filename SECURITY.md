# Seguridad

## Cómo avisar de una vulnerabilidad

Usa el aviso privado de GitHub: pestaña **Security → Report a vulnerability** de este repositorio. No abras un issue público.

Intentaré responder en 7 días. Incluye, si puedes, los pasos para reproducirlo y el impacto que ves.

## Qué protege Soleva

- Entrada sin contraseñas: código de 6 cifras por email, caduca en 10 minutos, 3 intentos por código y se guarda con hash.
- Límite de intentos por IP guardado en la base de datos (envío de códigos y entrada).
- Cookies de sesión `HttpOnly`, `Secure` y `SameSite=Lax`; formularios protegidos contra CSRF por origen.
- Regla del proyecto: cada lectura y escritura filtra por el usuario de la sesión y un recurso ajeno responde 404 (con tests de acceso cruzado desde los primeros datos de usuario).
- CSP con nonce, HSTS, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`.
- Datos en la UE (Neon, Frankfurt); sin analítica de terceros ni fuentes externas.
- Secretos fuera del repositorio; secret scanning y push protection de GitHub activados.

## Versiones con soporte

Solo la rama `main` mientras el proyecto esté en 0.x.
