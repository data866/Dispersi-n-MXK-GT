# Clientes únicos: investigación y ampliación pendiente

## Evidencia comprobada

1. En `a11d2db:scripts/refresh.py`, la consulta `REQUESTS_SQL` comienza con `clientes_unicos`, agrupa por `formularioCapturaJson ->> '$.docIdent'` y selecciona `MAX(og.id)`. El SELECT final parte de `clientes_unicos`. Por tanto, **esa consulta histórica retiene solo el último flujo por documento**, no todas las solicitudes de cada cliente. Las uniones posteriores también deben revisarse para evitar multiplicación por formularios/consultas de buró.
2. Los dos scripts Python actuales del repositorio están deshabilitados. No se modificaron ni ejecutaron. Esto no permite concluir qué consulta usa la automatización externa actual.
3. `apps-script/Public_API.gs` toma `raw.requests` de `construirDatosVercel_` y agrupa conteos por fecha/semana/distribuidor/sucursal/usuario/seguimiento. No entrega documentos ni identificadores de solicitud. `construirDatosVercel_` no está versionada en este repositorio. El script versionado no representa fielmente todos los campos y nombres de la respuesta desplegada.
4. Se buscó el proyecto `Actualizacion_Dashboard` y archivos Apps Script en el Drive conectado, sin resultados. Se encontró y leyó `Fuentes Looker GT` (ID `1EkqoiZzkoclbFsmq87SoeI5V3T7nIPVGESRYHtfO-Ec`): contiene encabezados de solicitudes y dispersión, sin documentos ni identificador de solicitud. No se ha establecido que sea la hoja que utiliza el dashboard desplegado.

**Conclusión:** no existe evidencia suficiente para reconstruir el historial de solicitudes ni clientes únicos desde el JSON actual. No se usará el conteo de registros consolidados como historial completo ni se inventará un promedio 1.00.

## Preparación ejecutada solo en GitHub/Vercel Preview

- `public/client-metrics.mjs`: contrato estricto de agregados opcionales `clientMetrics` y selección de la combinación exacta mes/distribuidor/sucursal/corte. No suma clientes únicos por día, sucursal o distribuidor.
- `api/data.mjs`: admite y valida únicamente el nuevo bloque agregado opcional. Sigue rechazando `doc_ident`, hashes, requestId u otros campos no autorizados. La ausencia del bloque conserva la compatibilidad con la fuente actual.
- `public/summary-metrics.mjs` y `summary-view.mjs`: leen el bloque cuando exista. Promedio = `totalRequests / uniqueClients`, con dos decimales. Cero clientes y cero solicitudes: muestra 0 clientes y — para el promedio. Sin bloque, cobertura o identificadores suficientes: muestra No disponible con la causa.
- En ausencia de historial verificable, el pie dice “Registros en vista actual”; solo usa “Total de solicitudes consideradas” cuando llega el conteo explícito del historial.
- `proposals/client-counts.mjs`: algoritmo de referencia probado, **sin importaciones desde el dashboard ni despliegue en Apps Script**. Deduplica eventos por identificador de solicitud para evitar duplicados de joins; conserva distintas solicitudes del mismo documento; calcula un Set de documentos dentro de cada conjunto exacto de filtros. Solo recorta espacios en documentos y conserva ceros iniciales. Ningún documento ni identificador sale en el resultado.

Los datos ficticios de tests sirven exclusivamente para verificar los casos matemáticos; no se usan como respuesta de la API ni se muestran en la vista previa.

## Cambio externo propuesto, NO ejecutado

Primero se necesita el enlace del Apps Script desplegado y su hoja para leer `construirDatosVercel_` y la consulta que alimenta solicitudes. Antes de editar se debe verificar si cada fila es un evento de solicitud, su ID estable, su fecha original, su sucursal/distribuidor y `doc_ident` como texto, y si contiene todos los eventos históricos o solo la última solicitud por cliente.

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
