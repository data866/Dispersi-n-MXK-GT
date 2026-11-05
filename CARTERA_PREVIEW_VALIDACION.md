# Validación de integración Cartera — 5 de noviembre de 2026

Alcance: solo `demo/acceso-sobre-dashboard-original` del portal y lectura de `feat/sesion-central-maxikash` de Cartera. No modificar main, Production, permisos, credenciales ni protección de despliegues.

## Hallazgos reales

- Sesión real del portal: administrador exclusivo, con permiso de Distribuidores, sin consulta/descarga de Cartera. Ser administrador del portal no concede acceso a Cartera. El 403 era legítimo y ocurre antes de firmar o consultar el módulo.
- Auditoría de solo lectura de la política central: 27 usuarios, 18 consultas de Cartera y 8 descargas. Ambas listas coinciden exactamente con las del servidor original de Cartera. Un administrador exclusivo. No se imprime ni modifica la matriz.
- El gateway firmado del diagnóstico devuelve una redirección no permitida. Una solicitud sin sesión Vercel al mismo Preview confirmó HTTP 302 a `vercel.com/sso-api`: la barrera de Vercel actúa antes del handler de Cartera. No se siguió la redirección con la autorización firmada y no se desactivó la protección.
- Vercel muestra `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` asignadas a Preview. Solo se comprobaron nombres y alcance; no valores. No aparecen `BQ_SA_JSON` ni `MXK_CENTRAL_PUBLIC_KEY` en la configuración visible del proyecto.
- Distribuidores carga sus tablas y cifras reales con la sesión actual, sin un segundo login.

## Cambio

`api/cartera.mjs` conserva el 403 de un usuario sin permiso. Para la pantalla del módulo muestra un mensaje HTML claro, explicando que administrar el portal no concede consulta de Cartera; las APIs mantienen respuestas JSON y la comprobación del servidor. Las redirecciones a SSO de Vercel se identifican como un bloqueo de conexión entre Preview, sin revelar su URL ni seguirla. El CSP del iframe también se aplica a la ruta `dashboard` utilizada actualmente.

No cambia sesión, matriz, listas de permisos, diseño/cálculos de dashboards, SQL ni conexión de bases.

## Pruebas controladas

Seis pruebas locales, sin conexiones ni datos reales: rechazo del administrador sin Cartera antes del upstream; lector autorizado con firma Ed25519 aceptada por una copia exacta del verificador actual de Cartera; descarga separada de consulta; diagnóstico exclusivo del administrador; detección segura de redirección Vercel; rechazo anónimo, rutas no permitidas, POST y Production. `tests/cartera-session-copy.mjs` es una copia exacta del verificador de Cartera en fe6de1c, solo para pruebas entre repositorios.

## Dependencias para datos reales

1. Un mecanismo autorizado de comunicación entre servidores a través de Deployment Protection, sin apagar autenticación. La configuración actual redirige antes de ejecutar las APIs. No se crean ni copian credenciales de bypass.
2. Configurar en el Preview de Cartera la clave pública que corresponda al firmante del portal. Es una clave pública, no la clave privada. Actualmente no aparece configurada. No se concede acceso a ningún usuario por este medio; las listas originales se siguen verificando después de la firma.
3. BigQuery requiere una identidad autorizada de solo lectura para `mk-ddo-analitica.ds_raw_croop_GTmanual.raw_cartera` y ejecución de consultas. No se recuperan secretos de otros proyectos. Un administrador debe configurar la credencial de la aplicación directamente en Vercel o aprobar una alternativa de federación.
4. Después de resolver la comunicación: ejecutar el diagnóstico firmado con la sesión administrativa real para `SELECT 1` y hasta 10 registros sin campos personales; después verificar el dashboard y descargas con una cuenta de consulta ya autorizada, sin suplantaciones.

No se declara conexión MySQL exitosa: el bloqueo ocurre antes de llegar a la base y no permite concluir nada sobre contraseña, privilegios SQL o saturación. Las consultas originales mantienen cierre de conexión en `finally`. No se declara funcionamiento de BigQuery en Vercel sin credencial ni consulta real.
