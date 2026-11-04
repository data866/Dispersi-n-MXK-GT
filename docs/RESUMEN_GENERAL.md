# Resumen general

Quinta pestaña basada en la referencia entregada: seis tarjetas, dona y evolución en dos columnas, activación y clientes en la fila inferior. CSS exclusivo del resumen; se conserva el bloque CSS original, logotipo, bandera y las cuatro vistas existentes.

## Cálculos

- Todas las cifras del resumen usan el mes, distribuidor y sucursal seleccionados, hasta el menor entre fin de mes y fecha de corte de la fuente. Se suman conteos, nunca el número de filas agregadas.
- Aprobación = aprobadas / solicitudes × 100. No aprobación = (rechazadas + sin concluir) / solicitudes × 100. Denominador cero: —.
- Dona: mismos tres conteos y porcentajes del periodo seleccionado.
- Evolución: seis semanas calendario (lunes a domingo) hasta el corte del mes, con cantidades semanales, no acumulados históricos. Cada semana se intersecta con el mes y el corte. Se marca con asterisco la semana parcial. Fuera del mes se muestra —. La línea usa porcentaje semanal ponderado y eje derecho de 0 a 100%. Fechas de lunes evitan confundir semanas entre años.
- Activaciones y monto: suma de `credits` y `amount` en `dispersions`, por fecha de activación, con idénticos filtros. El monto visible se redondea a quetzales, conservando los decimales en el cálculo.
- No hay comparativos: la API no declara cobertura de semanas completas; filas ausentes no prueban que la extracción esté completa.
- El bloque de clientes admite conteos agregados del historial mediante `clientMetrics`, con promedio de dos decimales y filtros exactos. Sin ese bloque, los conteos de la vista actual se identifican como registros, no como historial de solicitudes. Clientes únicos y promedio permanecen no disponibles hasta verificar y ampliar la fuente. Véase `CLIENTES_UNICOS_AUTORIZACION.md`.

## Fuente pendiente de autorización

El JSON agregado no contiene `doc_ident` ni permite deduplicar clientes entre días, sucursales o distribuidores. Una ampliación compatible sería calcular en Apps Script, dentro de la fuente, COUNT DISTINCT de documentos válidos por la combinación exacta de filtros y periodo. Devolver solo `uniqueClients`, `consideredRequests` y cobertura/documentos faltantes; no devolver documentos ni sus hashes al navegador. El promedio se calcularía con solicitudes con identificador válido dividido entre clientes únicos, declarando la cobertura. No sumar conteos únicos diarios para obtener el mes.

Esta propuesta requiere revisar la función fuente `construirDatosVercel_`, que no está incluida en el repositorio, y autorización antes de editar o desplegar Apps Script. No se modificó ninguna fuente externa.

## Observación separada del alcance

`apps-script/Public_API.gs` versionado transforma nombres en “Usuario …”, mientras README y API del dashboard indican preservación. También carece de los campos de factor que la API actual exige. Es evidencia de una diferencia entre ese archivo y la versión desplegada, no motivo para reemplazar el script. Esta implementación conserva los nombres recibidos y no modifica acceso, autenticación, Apps Script, Python ni horarios.

## Verificación

`npm test` conserva la verificación SHA256 del CSS original y las pruebas de las cuatro vistas, y agrega pruebas de sumas ponderadas, mes, corte, semanas parciales, filtros, porcentajes vacíos y navegación a la quinta pestaña. Las fixtures son exclusivamente de pruebas y no se sirven al dashboard. Las pruebas históricas del corte fijo del 29 de octubre requieren ese snapshot exacto; no deben confundirse con la API actual.

No hacer merge ni desplegar a producción sin autorización expresa.
