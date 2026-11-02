# Propuesta: historial real de clientes y solicitudes

**Estado: preparada para revisión; NO instalada ni ejecutada contra MySQL, Drive, Sheets o Apps Script.** Requiere autorización expresa antes de cualquier cambio externo. Misma rama `feat/resumen-general`, PR #2. No hacer merge ni modificar producción.

## Archivos completos entregados

| Archivo | Función | Estado operativo |
|---|---|---|
| `VALIDAR_GT_clientes_unicos.sql` | Consulta de lectura independiente del cálculo de cohortes; filtros editables en el CTE parametros | No ejecutada en MySQL |
| `GT_clientes_unicos.sql` | Consulta independiente de historial y cohortes agregadas | Nueva propuesta; no ejecutada en MySQL |
| `actualizar_dashboard_automatico_CORREGIDO.py` | Copia completa del exportador actual; agrega un tercer CSV opcional del mismo run_id y un modo de validación solo local | No sustituye al script operativo todavía |
| `Clientes_Unicos.gs` | Nuevo archivo completo: verifica manifiesto/hash, calcula conteos exactos y entrega agregados | No añadido a Apps Script; habilitado=false por defecto |
| `Public_API.gs` | Copia completa de la versión REAL inspeccionada; doGet llama al envoltorio opcional | No desplegada; nombres y cálculos originales conservados |
| `public/client-metrics.mjs` | Contrato propuesto con fecha de extracción y clientes recurrentes | Copia propuesta, no reemplaza el módulo activo |
| `public/summary-metrics.mjs` | Módulo completo que usa el contrato en su misma carpeta | Copia propuesta |
| `public/summary-view.mjs` | Promedio con dos decimales y clientes recurrentes en el pie del bloque existente | Copia propuesta, sin cambios de estilos |
| `api/data.mjs` | API completa que valida el contrato propuesto | Copia propuesta |
| `test_sql.py`, `test_apps_script.mjs`, `test_python_proposal.py` | Pruebas locales de propuesta | No consultan servicios externos |
| `originales.sha256.json` | Huellas de los cinco archivos originales inspeccionados | Verifica que no se modificaron |

No requieren cambios `Código.gs`, `API_Vercel.gs`, `GT_solicitudes.sql`, `GT_ofertas.sql`, CSS, navegación, filtros, gráficas ni cuatro pestañas originales. Tampoco se añaden activadores, horarios, credenciales, servicios o proyectos. Se comprobó por lectura que las tareas `MAXIKASH_DASHBOARD_AUTO` y `MAXIKASH_DASHBOARD_AUTO_V2` apuntan al archivo original corregido; no se modificó ninguna tarea.

## Conjunto de datos y reglas

- **Solicitud:** `originacion_flujo.id`. La consulta parte de TODOS los flujos históricos elegibles, no de la CTE de último flujo por cliente.
- **Cliente:** `docIdent` de los formularios asociados a cada flujo. Se recortan espacios exteriores de MySQL, se conservan ceros iniciales y se compara como BINARY; valores de más de 200 bytes se consideran incidencias de identidad. No se utilizan nombres, usuarios ni hashes como identidad del cliente.
- Los formularios se reducen primero a una fila por flujo. Varias capturas con el mismo documento no multiplican una solicitud. Si contienen documentos distintos, el flujo se marca como ambiguo; no se escoge arbitrariamente el mayor documento ni la última captura.
- Un flujo sin documento de texto válido (incluidos JSON null, cadenas vacías o marcadores null/undefined) se incluye en el total de solicitudes, pero se registra como no identificable. Documentos numéricos JSON se tratan como incidencia de tipo: no se reconstruyen ceros perdidos.
- Fecha y mes: `DATE(DATE_SUB(og.fechaCreacion, INTERVAL 6 HOUR))`, igual que la consulta original. Se excluyen fechas nulas y posteriores al instante de extracción. El corte y snapshot se calculan con UTC menos seis horas.
- Se excluyen los usuarios internos `(1,2,4,5,7,8,13,16,17,36,38)` por cada flujo. Como en el original, un flujo sin usuario asociado no entra en ese universo.
- Distribuidor y sucursal se obtienen con las mismas relaciones `flujo → usuario → sucursal → distribuidor` del SQL original. **Es la asociación disponible hoy en esas tablas**. Si un usuario cambió de sucursal y se necesita la sucursal histórica del día de creación, hace falta verificar una relación histórica existente; no se inventa esa asociación.
- Los campos PK de usuario, sucursal y distribuidor deben confirmarse como únicos durante la validación autorizada. No se unen ofertas ni consultas de buró porque no son necesarias para estos indicadores y pueden multiplicar filas.

## Cómo se evitan clientes duplicados al combinar sucursales

Un CSV con solo los únicos por sucursal no permite deduplicar una unión arbitraria. Por eso el SQL no exporta ese desglose como única información: construye, dentro de MySQL, el vector de cantidades por pareja distribuidor–sucursal de cada cliente y mes. Cada vector ya contiene cantidades agregadas por cliente, mes y dimensión. Apps Script fusiona después los vectores idénticos mediante comparación integral en memoria; no se agrupa por un TEXT largo en MySQL ni se depende de comparación por prefijos o GROUP_CONCAT.

Cada fila agregada entrega solo `month`, `periodEnd`, `kind`, `clientCount`, `requestsByDimension` y `snapshotAt`. `requestsByDimension` contiene pares de distribuidor/sucursal y cantidades; **no contiene documentos, IDs de flujo, nombres de cliente ni hashes de identidad**. En el CSV cada vector identificado lleva clientCount=1; dos clientes pueden producir dos filas idénticas legítimas. Tras verificarse el hash del archivo, Apps Script fusiona esas dos filas como una cohorte con clientCount=2. Las filas idénticas del CSV agregado no son duplicados de JOIN: cada una ya procede de un cliente/mes distinto. No deben eliminarse con DISTINCT. Los grupos sin identidad o ambiguos llevan clientCount=0 y conservan solo cantidades de solicitudes.

Para una selección cualquiera, sea S el número de solicitudes del vector que cumplen TODOS los filtros y N el número de clientes de esa cohorte:

- Solicitudes distintas: sumar `S × N`.
- Clientes únicos: sumar `N` una sola vez si `S > 0`.
- Clientes con más de una solicitud: sumar `N` si `S > 1`.
- Promedio: dividir solicitudes distintas entre clientes únicos; mostrar dos decimales.

Para flujos no identificables se suman sus solicitudes una sola vez a total y missingIdentityRequests. Si ese indicador no es cero, la interfaz no presentará clientes/promedio/recurrentes parciales como cifras completas. Hace falta resolver esas incidencias o aprobar expresamente un conjunto identificado con cobertura visible; no se deducirán clientes desconocidos.

Ejemplo de negocio: cantidades 3, 2 y 1 corresponden a 3 clientes, 6 solicitudes, promedio 2.00 y 2 clientes recurrentes. Una misma persona que tiene una solicitud en X y otra en Y cuenta una vez al seleccionar X+Y; cuenta una vez en X y una vez en Y al consultar cada sucursal por separado.

`calcularClientesParaFiltros_` admite listas arbitrarias para ambos filtros. Para la interfaz existente, que permite una opción o Todas, Apps Script precalcula las cuatro clases actuales en una pasada: general, distribuidor, sucursal y pareja. No se añade multiselección ni se exportan cohortes al navegador. Si en el futuro se pide una selección múltiple, se calcula sobre los mismos vectores con esa función; nunca sumando únicos de filas existentes.

## Transporte y compatibilidad

1. El exportador mantiene los dos SQL originales sin cambios. Tras exportarlos intenta el nuevo SQL en la misma conexión y ejecución. Crea `GT_clientes_unicos_<run_id>.csv`, SHA-256 y una tercera entrada opcional en el manifiesto versión 1.
2. Si el SQL de clientes falla, no se incluye ese archivo en el manifiesto; los dos archivos originales pueden publicarse normalmente. Los horarios y nombres existentes se mantienen. No se utiliza un CSV viejo de clientes como sustituto del faltante.
3. La sincronización existente de `Código.gs` sigue importando solo las dos tablas originales. El nuevo CSV contiene agregados y no requiere una hoja adicional ni cambios en esa sincronización.
4. `Clientes_Unicos.gs` toma el último `run_id` PUBLICADO de CONTROL, no el último archivo subido sin publicar. Verifica nombre único, versión, columnas, número de filas, hash y correspondencia de conteos con las tablas visibles, bajo el mismo ScriptLock usado por la sincronización. Un estado ERROR posterior no se trata como publicación correcta.
5. Solo se lee el tercer CSV correspondiente a ese mismo run_id. Se comprueba su esquema exacto, fechas, tipos, cobertura y dimensiones, rechazando campos personales adicionales. Límite propuesto: CSV de 10 MB, 100,000 cohortes o combinaciones. Si se supera, se omiten clientes y se mantienen los datos originales; debe revisarse el tamaño real antes de activar.
6. Se distingue `updatedAt` (lectura del dashboard) de `snapshotAt` (extracción MySQL). Después de medianoche no se presenta como completo el mes actual si el CSV solo cubre hasta ayer. Los meses ya cerrados siguen siendo válidos. Las marcas coverage del SQL permiten distinguir cero real de periodo ausente; no se declaran ceros en meses anteriores al primer flujo disponible ni futuros.
7. El bloque opcional clientMetrics devuelve únicamente conteos para cada conjunto exacto. El API y frontend propuestos aceptan snapshotAt y repeatClients. Deben instalarse juntos en PREVIEW antes de habilitar la fuente de prueba.
8. Las tarjetas, la dona y las gráficas siguen usando la fuente consolidada actual, según la restricción de no cambiar cálculos. El total de solicitudes distintas del bloque de clientes procede del historial y puede diferir del total de registros de las tarjetas. No se usará ese total consolidado como numerador del promedio.

## Pruebas realizadas ahora, sin servicios externos

- Parser de dialecto MySQL: consulta válida como una sola sentencia de lectura.
- Ejecución relacional de la consulta en SQLite en memoria, con adaptaciones explícitas de funciones de fecha/JSON/collation. Se verificaron **90 combinaciones**, incluidos subconjuntos de sucursales y distribuidores, conjuntos vacíos, varios meses, duplicados de formulario, documentos contradictorios, usuarios internos, datos futuros, clientes que cruzan dimensiones y el borde horario del día 1 a las 05:59:59/06:00 UTC.
- La salida SQL de prueba se pasó al Apps Script propuesto dentro de un entorno JavaScript local, no a Google. Se verificaron agrupación de clientes idénticos, equivalencia del precálculo con la selección directa, SHA incorrecto, cortes mezclados/futuros, columnas privadas, periodos ausentes, datos incompletos, cambio de día y conservación de la respuesta original si falla el agregado.
- Ejemplo 3 clientes / 6 solicitudes / 2.00 / 2 recurrentes: aprobado.
- Python: sintaxis compilada y estructura revisada SIN importar ni ejecutar el exportador. Tres pruebas estáticas verifican hashes originales, llamadas de autenticación y auxiliares preservados.
- Regresión de la aplicación actual con snapshot real del 2 de noviembre a las 11:55:54 (-06:00): 12 aprobadas, 2 omitidas por requerir un snapshot histórico fijo; 5,310 combinaciones reales, nueve exportaciones XLSX y CSS original. Estas pruebas no certifican todavía los conteos históricos nuevos.

Las fixtures de pruebas son exclusivas para verificar lógica; no se sirven al dashboard. **No se ejecutó el SQL en MySQL, no se midió el plan ni se certificó el tiempo/costo real de la consulta.** La prueba SQLite no sustituye la prueba del motor MySQL.

El SQL requiere **MySQL 8.0.14 o superior**, por JSON_ARRAYAGG como función de ventana, [según la documentación oficial](https://dev.mysql.com/blog-archive/json-specific-window-functions-in-mysql-8-0/). No es una consulta compatible con MariaDB. El modo local del Python comprueba SELECT VERSION() antes de consultar; no se cambia ni actualiza el servidor. También deben revisarse el límite de recursión para más de 1,000 meses y el tamaño de los vectores en el historial real.

## Pasos exactos DESPUÉS de autorización

1. Confirmar alcance de la autorización: primero validación de solo lectura y archivos locales; cualquier publicación externa se autoriza por separado si no fue incluida. Verificar los SHA-256 y guardar copias de reversión de los archivos operativos y de la versión actual de Apps Script. No cambiar SQL originales, tareas ni horarios.
2. En una carpeta local de revisión, colocar el nuevo SQL junto al Python propuesto. Mantener la misma configuración de acceso existente (variable MAXIKASH_RDS_HOST y keyring MAXIKASH_RDS / rodrigo.marin). No crear ni pedir credenciales nuevas. Ejecutar SOLO con `--validar-clientes`. Ese modo consulta versión y clientes y guarda CSV/VALIDACION_LOCAL.json en EXPORTACIONES/PRUEBA_CLIENTES; no consulta los otros SQL, no escribe en Drive ni publica manifiestos.
3. Confirmar versión compatible, claves primarias, interpretación de fechaCreacion, política de documentos ambiguos/faltantes y asociación de sucursal. Revisar EXPLAIN sin ANALYZE y evaluar el plan/índices existentes; no crear índices ni cambiar MySQL sin otra autorización.
4. Validar resultados MySQL: para al menos un mes cerrado, el actual, un distribuidor, una sucursal, dos sucursales del mismo distribuidor y sucursales de distintos distribuidores, comparar directamente COUNT(DISTINCT flujo.id), COUNT(DISTINCT documento) y número de documentos con COUNT(DISTINCT flujo.id)>1 sobre los eventos filtrados. Puede usarse `VALIDAR_GT_clientes_unicos.sql`, editando solo su CTE parametros en una copia de prueba. Devuelve únicamente conteos y promedio, nunca documentos. Es una comparación independiente de la construcción de cohortes, aunque comparte las reglas de elegibilidad e identidad; esas reglas se revisan también con la fuente. Usar IDs/documentos solo dentro de MySQL; informar únicamente totales. Duplicar capturas en fixtures no debe cambiar resultados; no insertar filas de prueba en la base real. Revisar por separado documentos vacíos/ambiguos y flujos del borde horario.
5. Si se aprueba la validación y la integración externa: instalar el nuevo SQL como archivo adicional y sustituir únicamente el Python corregido por la copia aprobada. Las dos tareas existentes seguirán apuntando a su misma ruta y horario. Desde entonces las ejecuciones normales podrán incluir el tercer CSV; si falla, los dos originales siguen siendo publicables. No es necesario ejecutar ahora una corrida completa ni forzar actualizaciones de producción para esta revisión.
6. Preparar la integración de prueba en el MISMO Apps Script: añadir Clientes_Unicos.gs y la copia Public_API.gs. Mantener Código.gs y API_Vercel.gs intactos. Crear una versión de PRUEBA con habilitado=true; conservar el ID y versión del despliegue de producción. Reutilizar la configuración de acceso vigente, sin ampliar permisos. No actualizar el despliegue productivo. Si no existe una forma de disponer de un run_id publicado con el tercer CSV sin violar el alcance aprobado, detenerse para acordarlo.
7. En la misma rama/PR #2, sustituir los cuatro archivos web por sus copias propuestas y ejecutar las pruebas. Desplegar solo Preview. Configurar SHEETS_PUBLIC_URL únicamente en el entorno Preview para esa versión de prueba de Apps Script; no cambiar la variable de Production.
8. Verificar en el Preview y contra MySQL los cuatro indicadores, los filtros y los casos de cliente en varias sucursales. Comprobar que no aparecen documentos/hashes/IDs en CSV de cohortes ni API, que el promedio tiene dos decimales y que recurrentes usa el conjunto filtrado. Revisar tarjetas alineadas, diseño, dona, semanas, activación, montos, cuatro pestañas y XLSX. Registrar cortes, totales reales y tiempos de respuesta.
9. Si hay discrepancias, documentos no identificables o falta de cobertura, no declarar 100% ni cambiar la fuente original. Mantener el PR en borrador. Reversión de prueba: deshabilitar el agregado o restablecer el Preview al endpoint anterior; no tocar producción. No borrar archivos de ejecuciones ni alterar historiales.
10. Entregar evidencia real para revisión. Hacer merge o publicar en producción requiere una autorización posterior y expresa.

**Hasta recibir autorización, detenerse aquí: solo propuestas locales/GitHub; sin SQL operativo, cambios externos ni despliegues de fuentes.**
