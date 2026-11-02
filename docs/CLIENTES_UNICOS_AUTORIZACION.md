# Clientes únicos: investigación y ampliación pendiente

## Evidencia comprobada

1. En `a11d2db:scripts/refresh.py`, la consulta `REQUESTS_SQL` comienza con `clientes_unicos`, agrupa por `formularioCapturaJson ->> '$.docIdent'` y selecciona `MAX(og.id)`. El SELECT final parte de `clientes_unicos`. Por tanto, **esa consulta histórica retiene solo el último flujo por documento**, no todas las solicitudes de cada cliente. Las uniones posteriores también deben revisarse para evitar multiplicación por formularios/consultas de buró.
2. Los dos scripts Python actuales del repositorio están deshabilitados. No se modificaron ni ejecutaron. Esto no permite concluir qué consulta usa la automatización externa actual.
3. `apps-script/Public_API.gs` toma `raw.requests` de `construirDatosVercel_` y agrupa conteos por fecha/semana/distribuidor/sucursal/usuario/seguimiento. No entrega documentos ni identificadores de solicitud. `construirDatosVercel_` no está versionada en este repositorio. El script versionado no representa fielmente todos los campos y nombres de la respuesta desplegada.
4. Se buscó el proyecto `Actualizacion_Dashboard` y archivos Apps Script en el Drive conectado, sin resultados. Se encontró y leyó `Fuentes Looker GT` (ID `1EkqoiZzkoclbFsmq87SoeI5V3T7nIPVGESRYHtfO-Ec`): contiene encabezados de solicitudes y dispersión, sin documentos ni identificador de solicitud. No se ha establecido que sea la hoja que utiliza el dashboard desplegado.

## Inspección de la fuente actual, 2 de noviembre de 2026

Después de recibir acceso, se leyó el proyecto Apps Script `1iFOxF55vC2xJdZxDRX3SDEfErb7o2W2xe1Vi24mXAI_qAI4bPCIg-DLV` sin editar ni ejecutar funciones.

- `API_Vercel.gs`: `construirDatosVercel_` abre `BD_DASHBOARD_MAXIKASH`, ID `1uHHZgBT7oz68yyvXNghjNK-nd8pD2yW72wfCu8rL9FU`, y lee `GT_solicitudes`, `GT_ofertas` y `GT_ppto_activacion`. Mapea `solicitud` a `id` y `doc_ident` a `doc` internamente. No deduplica solicitudes.
- `Public_API.gs` actual conserva los nombres reales y agrupa/suma una unidad por cada fila recibida; no devuelve documentos. Esta versión sí incluye campos de factor. La divergencia respecto al archivo histórico versionado quedó confirmada; no se reemplazó ese archivo.
- `Código.gs` importa CSV y publica las hojas mediante manifiestos y hashes. El origen de solicitudes es `GT_solicitudes_<runId>.csv`; el script no contiene la consulta que generó los CSV. No se alteraron funciones, activadores ni horarios.
- Se leyó en el navegador `GT_solicitudes!A1:Z1`; el último límite de hoja era `Z9790`. Para la comprobación se leyeron únicamente `A2:A9790` (solicitud) y `O2:O9790` (doc_ident), y se calcularon estadísticas en memoria sin mostrar ni guardar documentos.
- Resultado: **9,789 filas, 9,597 IDs de solicitud distintos, 9,597 documentos distintos, cero IDs/documentos vacíos**. Hay **151 documentos con más de una fila**, máximo **8 filas por documento**, pero **ningún documento con más de un ID de solicitud distinto**. Ningún ID de solicitud corresponde a documentos distintos. Las **192 filas adicionales repiten el mismo par solicitud/documento**.

**Conclusión actual:** la hoja disponible tiene una sola solicitud distinta por documento y filas repetidas de esa misma solicitud. Esto es compatible con la consulta histórica de último flujo, pero no prueba qué consulta ejecuta hoy el proceso externo. Las repeticiones no son evidencia de solicitudes adicionales y no se usarán para inflar el promedio. Se puede contar clientes del conjunto disponible, pero ese conteo no demuestra el historial completo solicitado ni permite recuperar sucursales/fechas de solicitudes anteriores. No se activará `basis: request-history` con este conjunto sin evidencia adicional de cobertura.

Los totales existentes del dashboard se conservan: esta revisión no autoriza corregir la fuente ni modificar los cálculos de las cuatro pestañas.

## Preparación ejecutada solo en GitHub/Vercel Preview

- `public/client-metrics.mjs`: contrato estricto de agregados opcionales `clientMetrics` y selección de la combinación exacta mes/distribuidor/sucursal/corte. No suma clientes únicos por día, sucursal o distribuidor.
- `api/data.mjs`: admite y valida únicamente el nuevo bloque agregado opcional. Sigue rechazando `doc_ident`, hashes, requestId u otros campos no autorizados. La ausencia del bloque conserva la compatibilidad con la fuente actual.
- `public/summary-metrics.mjs` y `summary-view.mjs`: leen el bloque cuando exista. Promedio = `totalRequests / uniqueClients`, con dos decimales. Cero clientes y cero solicitudes: muestra 0 clientes y — para el promedio. Sin bloque, cobertura o identificadores suficientes: muestra No disponible con la causa.
- En ausencia de historial verificable, el pie dice “Registros en vista actual”; solo usa “Total de solicitudes consideradas” cuando llega el conteo explícito del historial.
- `proposals/client-counts.mjs`: algoritmo de referencia probado, **sin importaciones desde el dashboard ni despliegue en Apps Script**. Deduplica eventos por identificador de solicitud para evitar duplicados de joins; conserva distintas solicitudes del mismo documento; calcula un Set de documentos dentro de cada conjunto exacto de filtros. Solo recorta espacios en documentos y conserva ceros iniciales. Ningún documento ni identificador sale en el resultado.

Los datos ficticios de tests sirven exclusivamente para verificar los casos matemáticos; no se usan como respuesta de la API ni se muestran en la vista previa.

## Cambio externo propuesto, NO ejecutado

El Apps Script y la hoja ya se inspeccionaron. El siguiente dato necesario es la consulta actual que genera `GT_solicitudes_<runId>.csv`, o una fuente existente con todas las solicitudes. Revisarla es una acción de solo lectura; no se modificará ni ejecutará Python. Antes de activar conteos hay que confirmar la cobertura del historial y explicar las filas repetidas por ID de solicitud.

Si la hoja actual ya contiene el historial completo con esos campos:

1. Agregar en el Apps Script existente una función separada de conteos, adaptando `proposals/client-counts.mjs` a los encabezados reales. Leer el historial sin escribir ni alterar hojas; no cambiar `construirDatosVercel_` ni las cuatro vistas existentes.
2. Conservar una fila por solicitud, no por cliente; deduplicar joins por ID de solicitud. Aplicar periodo y filtros antes del COUNT DISTINCT de `doc_ident`.
3. Añadir `clientMetrics` a la respuesta existente, con el mismo `updatedAt`, `basis: 'request-history'` y filas agregadas para todas las combinaciones válidas de filtros y meses cuya cobertura haya sido comprobada.
4. Cada fila devuelve únicamente `month`, `periodEnd`, `distributor` (null=Todos), `branch` (null=Todas), `totalRequests`, `uniqueClients` y `missingIdentityRequests`. No devolver documentos, IDs de solicitud, hashes ni listas de clientes.
5. Si hay solicitudes sin documento, devolver su cantidad: no presentar el conteo parcial de clientes como completo ni calcular el promedio del conjunto completo sobre un denominador incompleto.
6. Validar contra conteos directos de la hoja, incluyendo un cliente con varias solicitudes, distintas sucursales y meses, solicitudes repetidas por joins y documentos faltantes. Conservar nombres de usuario, permisos, automatizaciones y horarios.

Si la hoja conserva solo el último flujo por cliente, **Apps Script no puede recuperar los eventos descartados**. Se necesita localizar una fuente existente con historial completo. No está autorizado cambiar Python ni su consulta, y no se propone ejecutarlo. Si ninguna fuente existente conserva el historial, se debe acordar cómo proporcionarlo antes de activar los indicadores. La consulta histórica del repositorio no se restaurará ni ejecutará.

## Autorización requerida

La autorización solicitada se limita a añadir el cálculo agregado de clientes en el Apps Script existente **si se confirma un historial completo**, sin alterar Python, datos originales, autenticación ni las cuatro pestañas. Antes de desplegar esa modificación se debe revisar su efecto sobre todos los consumidores del endpoint: si es compartido con producción, se requiere una versión de prueba del mismo proyecto Apps Script o detenerse para acordar una alternativa; no se modificará el endpoint de producción.

No se ha editado ni desplegado Apps Script, Sheets, Python o ninguna fuente externa. La pestaña no está terminada al 100% mientras los conteos reales estén pendientes.
