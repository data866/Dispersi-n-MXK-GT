# Conexión de clientes identificados — lista, pendiente de fuente real

El repositorio recibe el bloque opcional `clientMetrics` de `/api/data`. No contiene documentos, IDs de flujo/cliente, hashes ni datos de prueba. No se fija en el dashboard ningún conteo de las validaciones anteriores. Si el bloque o la combinación filtrada faltan, los indicadores muestran No disponible y un mensaje de datos reales pendientes.

## Contrato para la implementación manual externa

La respuesta original de esquema 3 permanece intacta y puede añadir:

- `clientMetrics.basis`: `request-history`.
- `clientMetrics.updatedAt`: exactamente el `updatedAt` de la respuesta principal.
- `clientMetrics.snapshotAt`: opcional por compatibilidad; recomendado como fecha real de extracción ISO con offset -06:00, no posterior a updatedAt.
- `clientMetrics.rows`: una fila por combinación EXACTA de mes/distribuidor/sucursal y corte. Los únicos de varias sucursales deben deduplicarse en la fuente; nunca sumar únicos parciales.

Cada fila contiene:

| Campo | Significado |
|---|---|
| `month` | AAAA-MM del flujo, con el ajuste horario validado |
| `periodEnd` | Menor entre fin de mes y fecha del corte visible; no posterior al snapshot |
| `distributor`, `branch` | Nombre exacto del filtro; null significa Todos/Todas |
| `totalRequests` | Todas las solicitudes distintas, incluidas las sin identidad y las contradictorias |
| `identifiedRequests` | Recomendado: solicitudes con identidad aceptada. Debe coincidir con totalRequests - missingIdentityRequests |
| `uniqueClients` | Clientes únicos IDENTIFICADOS del conjunto filtrado |
| `repeatClients` | Clientes IDENTIFICADOS con más de una solicitud distinta en ese conjunto |
| `missingIdentityRequests` | Todas las solicitudes excluidas de identidad, incluidas contradicciones |
| `contradictionRequests` | Opcional: solicitudes contradictorias, subconjunto de missingIdentityRequests |
| `recoveredRequests` | Opcional: solicitudes recuperadas por ambas fuentes, subconjunto de identifiedRequests |

`identifiedRequests` puede omitirse por compatibilidad: se deriva exactamente de totalRequests - missingIdentityRequests. `repeatClients` debe proporcionarse para mostrar recurrentes; no se estima si falta. Los campos opcionales no permiten añadir propiedades arbitrarias ni identificadores personales.

Se acepta el documento de formulario sin contradicción. Una nueva recuperación requiere documentos únicos y concordantes de validación exitosa y OCR exitoso según la regla MySQL aprobada; ninguna recuperación de una sola fuente. Las contradicciones permanecen en total y missingIdentityRequests. No reutilizar el borrador anterior que ocultaba todos los clientes al existir una solicitud sin documento: ahora se presentan explícitamente los clientes identificados y la cobertura.

## Cálculos y presentación

- Clientes: uniqueClients. Recurrentes: repeatClients.
- Promedio entre identificados: identifiedRequests / uniqueClients, con dos decimales. Cero clientes: —.
- Cobertura: identifiedRequests / totalRequests × 100, con dos decimales. Cero solicitudes: —.
- El total del bloque de clientes usa el historial; las seis tarjetas y gráficas conservan sus cálculos y fuente anteriores.
- Se mantienen las dos columnas del bloque y los estilos existentes. Recurrentes, identificadas, sin identidad y cobertura aparecen en su pie actual.

Los tres filtros buscan la fila exacta; no hay sustitución por el total general ni sumas de únicos por sucursal. Un mes/combinación que carece de fila permanece pendiente, en vez de inventarse un cero. Una fila explícita con ceros sí permite mostrar cero clientes.

## Verificación

Pruebas locales del contrato, promedio identificado con documentos faltantes, recurrentes, cobertura, filtros, corte, campos privados e inconsistencias. Las fixtures del contrato son exclusivamente de pruebas y nunca se presentan como datos reales ni se sirven al dashboard. La regresión existente verifica cinco pestañas, CSS original, nombres y exportaciones. No se ejecutó SQL nuevamente ni se modificaron Python, Sheets o Apps Script para esta integración del repositorio.

**Estado:** PR preparado para recibir los agregados reales. La API actual aún no los proporciona en el snapshot disponible. Los totales validados no se han inyectado como datos en vivo. No hacer merge ni publicar producción.
