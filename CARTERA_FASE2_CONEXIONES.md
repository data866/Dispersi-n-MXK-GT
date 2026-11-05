# Fase 2 — conexiones Preview MAXIKASH

Estado: código preparado; configuración externa y pruebas reales pendientes. Solo rama `demo/acceso-sobre-dashboard-original`; Cartera permanece en `feat/sesion-central-maxikash`. No modificar Production, main ni permisos de usuarios.

## 1. Comunicación entre Preview sin secreto permanente

La documentación vigente de Vercel indica que Trusted Sources está disponible en todos los planes, incluido Hobby. Permite autorizar otro proyecto del mismo equipo con tokens OIDC temporales. Se mantiene Deployment Protection para los demás solicitantes.

Destino: `data-3272/cartera-guatemala` → Settings → Deployment Protection → Trusted Sources → Vercel Projects.
Origen que se debe agregar: `dispersi-n-mxk-gt`.
Regla exacta: **from Preview → to Preview**, exclusivamente. Eliminar del editor del NUEVO origen los pares Production y Development que Vercel pudiera rellenar por defecto; no cambiar las reglas de autoacceso existentes de Cartera. No agregar excepciones públicas de dominio ni deshabilitar Vercel Authentication.

No se ha guardado esta regla. Es un cambio de confianza entre proyectos y requiere confirmación en Vercel. No se necesita crear ni compartir una credencial de automatización permanente si Trusted Sources está disponible en la cuenta.

El gateway obtiene el token con `getVercelOidcToken()` de `@vercel/oidc` y lo envía en `x-vercel-trusted-oidc-idp-token`. Conserva, por separado, `Authorization: Bearer MXK1...` para la firma Ed25519 y la política de usuarios. No se envían tokens en URL, al navegador, a registros o en redirecciones. El destino queda restringido al origen exacto del Preview de Cartera autorizado. Si falta OIDC, falla cerrado.

Si el portal no obtiene identidad OIDC, comprobar Settings → Security → Secure Backend Access with OIDC Federation. No rotar ni extraer secretos de otro proyecto.

## 2. Clave pública correspondiente al firmante actual

Nuevo recurso administrativo, GET `/api/auth?view=module-key`, dentro del Preview del portal:

- Exige sesión real de `data@maxikash.mx` y permiso de administración.
- Solo funciona en la rama Preview autorizada.
- Deriva la clave pública de `MXK_MODULE_PRIVATE_KEY` en el servidor, con `createPublicKey`.
- Devuelve únicamente la pública SPKI DER en base64, huella SHA256 y un booleano `oidcAvailable`.
- No genera un par nuevo, no rota, exporta ni registra la clave privada, y no devuelve el token OIDC.

Configurar el campo `publicKey` como `MXK_CENTRAL_PUBLIC_KEY` en Cartera, únicamente Preview de `feat/sesion-central-maxikash`, y hacer redeploy de ese Preview. La clave pública no es un secreto. No copiar `MXK_MODULE_PRIVATE_KEY` a Cartera.

Pendiente real: obtener esa respuesta bajo la sesión administrativa y guardar la pública en Vercel. Chrome no respondió durante esta fase (`MCP request timed out`), por lo que no se afirmó haber configurado la regla ni la clave.

Verificación real después de configurar ambas: abrir desde la sesión administrativa `/modules/cartera/api/diagnostico-mysql-gt`. Un resultado propio del handler de diagnóstico, incluso un error SQL saneado, demuestra que se superaron Deployment Protection y la verificación Ed25519. Un redirect SSO o 401 no demuestra firma correcta. No alterar los 18 lectores ni las 8 descargas; el administrador continúa sin consulta de Cartera.

## 3. MySQL

No se repitió la auditoría de variables de la fase anterior. No se extraen valores de `DB_*`. La prueba real sigue pendiente del acceso al handler. Debe verificar `SELECT 1` y `SELECT 1 AS registro FROM mk-stp-prod.TransaccionAks LIMIT 10`, sin campos personales. El handler existente cierra la conexión en `finally`. No se declara éxito, saturación, contraseña incorrecta o falta de privilegios hasta obtener una respuesta real.

## 4. Solicitud preparada para el administrador de BigQuery

**Identidad de aplicación propuesta:** cuenta existente `cartera-gt-bot@mk-ddo-analitica.iam.gserviceaccount.com`, previa confirmación de su propietario; alternativamente una cuenta de servicio de solo lectura aprobada por el administrador. No es la identidad personal `data@maxikash.mx` del navegador.

**Destino:** proyecto `mk-ddo-analitica`; tabla `ds_raw_croop_GTmanual.raw_cartera`.

**Verificar y, solo con aprobación, conceder si falta:**
- `roles/bigquery.jobUser` en el proyecto que ejecuta las consultas (`mk-ddo-analitica`). Proporciona `bigquery.jobs.create`.
- `roles/bigquery.dataViewer` en la tabla `raw_cartera`, evitando ampliarlo a todo el proyecto. Proporciona lectura de metadatos y datos; si la fuente es una vista, revisar también sus dependencias o usar una vista autorizada.
- No conceder Data Editor, Owner ni BigQuery Admin.

**Motivo:** ejecutar las consultas originales de cartera y sus descargas, conservando los controles de 18 lectores y 8 descargas de la aplicación. La consulta real del navegador de la fase anterior falló por `bigquery.tables.getData`; esto no demuestra el permiso de la identidad de aplicación.

**Alternativa sin claves permanentes:** Workload Identity Federation entre el OIDC de Vercel y Google Cloud. Vercel lo soporta en todos los planes. El administrador configura o reutiliza un pool/provider aprobado, asigna `google.subject = assertion.sub` y restringe la identidad exactamente a `owner:data-3272:project:cartera-guatemala:environment:preview`, validando el issuer real (modo Team o Global) y audiencia. Permitir a ese principal federado únicamente `roles/iam.workloadIdentityUser` sobre la cuenta de servicio elegida; no abrir un wildcard de toda la organización/equipo.

No se ha cambiado IAM ni creado pool, cuenta, clave o binding. La aplicación actual espera `BQ_SA_JSON`: si se aprueba federación, aún hay que adaptar la creación del cliente BigQuery para intercambiar OIDC por credenciales temporales mediante Google Auth, sin cambiar SQL ni cálculos. Configuración necesaria no secreta: número de proyecto, IDs de pool/provider, audiencia y cuenta de servicio aprobados. No inventar esos identificadores.

**Comprobar después:** desde el runtime Preview de Cartera usando la identidad de aplicación, ejecutar `SELECT 1`; después una consulta limitada a diez filas con solo recuento/columnas no personales y comprobar la carga original de cartera, cortes y descargas con usuarios ya autorizados. Confirmar la identidad y permisos efectivos en auditoría de Google Cloud. No solicitar claves o contraseñas por chat.

## 5. Evidencia y pendientes

Pruebas locales controladas: derivación pública corresponde al firmante, no devuelve material privado ni token OIDC; acceso exclusivo al administrador; bloqueo sin clave, otras ramas y Production; dos cabeceras separadas; OIDC nunca se manda a otro origen; permisos originales se siguen aplicando. Se vuelve a ejecutar la suite de regresión de autenticación porque cambió `api/auth.mjs`.

Ninguna prueba controlada se presenta como conexión real. No se pudo completar una solicitud nueva entre Preview, consulta MySQL ni consulta BigQuery exitosa durante esta fase. El dashboard y sus resultados reales siguen pendientes de dichas dependencias. No se cambia Distribuidores ni Resumen General.

## Documentación oficial consultada

- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources
- https://vercel.com/docs/oidc/gcp
- https://docs.cloud.google.com/bigquery/docs/running-queries
- https://docs.cloud.google.com/iam/docs/workload-identity-federation
