-- PROPUESTA: solo lectura. MySQL 8. No sustituye GT_solicitudes.sql.
-- Cohortes agregadas por mes con cantidades por dimensión. Permiten cualquier subconjunto.
-- Los documentos se usan dentro de MySQL y NUNCA aparecen en el SELECT final.
WITH RECURSIVE
reloj AS (
    SELECT DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR)) AS corte,
           DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR),
                       '%Y-%m-%dT%H:%i:%s-06:00') AS snapshotAt
),
documentos AS (
    SELECT rfc.idOriginacionFlujo AS id_flujo,
           CAST(TRIM(rfc.formularioCapturaJson->>'$.docIdent') AS BINARY) AS documento
    FROM `originador-dev`.originacion_formulario_captura rfc
    WHERE JSON_TYPE(JSON_EXTRACT(rfc.formularioCapturaJson, '$.docIdent')) = 'STRING'
      AND TRIM(rfc.formularioCapturaJson->>'$.docIdent') <> ''
      AND OCTET_LENGTH(TRIM(rfc.formularioCapturaJson->>'$.docIdent')) <= 200
      AND LOWER(TRIM(rfc.formularioCapturaJson->>'$.docIdent')) NOT IN ('null', 'undefined')
),
identidades AS (
    SELECT id_flujo, COUNT(DISTINCT documento) AS documentos_distintos,
           CASE WHEN COUNT(DISTINCT documento) = 1 THEN MIN(documento) END AS documento
    FROM documentos
    GROUP BY id_flujo
),
flujos AS (
    SELECT og.id AS id_flujo,
           DATE(DATE_SUB(og.fechaCreacion, INTERVAL 6 HOUR)) AS fecha,
           COALESCE(NULLIF(TRIM(UPPER(d.nombre)), ''), 'Sin dato') AS distribuidor,
           COALESCE(NULLIF(TRIM(UPPER(s.nombre)), ''), 'Sin dato') AS sucursal,
           i.documento,
           CASE WHEN COALESCE(i.documentos_distintos, 0) > 1 THEN 1 ELSE 0 END AS ambiguo
    FROM `originador-dev`.originacion_flujo og
    INNER JOIN `maxi-prod`.usuario u ON u.pk_usuario = og.fk_usuario_creacion
    LEFT JOIN `maxi-prod`.sucursal s ON s.pk_sucursal = u.fk_sucursal
    LEFT JOIN `maxi-prod`.distribuidor d ON d.pk_distribuidor = s.fk_distribuidor
    LEFT JOIN identidades i ON i.id_flujo = og.id
    CROSS JOIN reloj r
    WHERE u.pk_usuario NOT IN (1,2,4,5,7,8,13,16,17,36,38)
      AND og.fechaCreacion IS NOT NULL
      AND og.fechaCreacion <= UTC_TIMESTAMP()
      AND DATE(DATE_SUB(og.fechaCreacion, INTERVAL 6 HOUR)) <= r.corte
),
meses (inicio) AS (
    SELECT CAST(DATE_FORMAT(MIN(fecha), '%Y-%m-01') AS DATE) FROM flujos
    HAVING MIN(fecha) IS NOT NULL
    UNION ALL
    SELECT DATE_ADD(m.inicio, INTERVAL 1 MONTH)
    FROM meses m CROSS JOIN reloj r
    WHERE DATE_ADD(m.inicio, INTERVAL 1 MONTH) <= r.corte
),
por_dimension AS (
    SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes,
           CASE WHEN documento IS NOT NULL THEN 'identified'
                WHEN ambiguo = 1 THEN 'ambiguous' ELSE 'missing' END AS tipo,
           documento, distribuidor, sucursal,
           COUNT(DISTINCT id_flujo) AS solicitudes
    FROM flujos
    GROUP BY mes, tipo, documento, distribuidor, sucursal
),
membresias AS (
    -- Orden total explícito: evita firmas JSON no deterministas y GROUP_CONCAT truncado.
    -- MySQL >= 8.0.14: JSON_ARRAYAGG como función de ventana.
    SELECT mes, tipo, documento,
           JSON_ARRAYAGG(JSON_OBJECT('distributor', distribuidor, 'branch', sucursal,
                                     'requests', solicitudes)) OVER (
               PARTITION BY mes, tipo, documento
               ORDER BY CAST(distribuidor AS BINARY), CAST(sucursal AS BINARY)
               ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
           ) AS membresia,
           ROW_NUMBER() OVER (
               PARTITION BY mes, tipo, documento
               ORDER BY CAST(distribuidor AS BINARY), CAST(sucursal AS BINARY)
           ) AS posicion
    FROM por_dimension
),
firmas AS (
    SELECT mes, tipo,
           CAST(membresia AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_bin AS firma
    FROM membresias WHERE posicion = 1
),
cohortes AS (
    -- Un vector agregado por cliente/mes, sin documento/ID/hash.
    -- NO agrupar por firma TEXT larga: evitar comparación por prefijos del motor.
    -- Apps Script fusiona vectores iguales con comparación integral en memoria.
    SELECT mes, tipo, firma,
           CASE WHEN tipo = 'identified' THEN 1 ELSE 0 END AS clientes
    FROM firmas
)
SELECT c.mes AS month,
       DATE_FORMAT(LEAST(LAST_DAY(CONCAT(c.mes, '-01')), r.corte), '%Y-%m-%d') AS periodEnd,
       c.tipo AS kind, c.clientes AS clientCount,
       c.firma AS requestsByDimension, r.snapshotAt AS snapshotAt
FROM cohortes c CROSS JOIN reloj r
UNION ALL
-- Marcas de cobertura: distinguen un cero real de un mes no exportado.
SELECT DATE_FORMAT(m.inicio, '%Y-%m') AS month,
       DATE_FORMAT(LEAST(LAST_DAY(m.inicio), r.corte), '%Y-%m-%d') AS periodEnd,
       'coverage' AS kind, 0 AS clientCount, '[]' AS requestsByDimension, r.snapshotAt
FROM meses m CROSS JOIN reloj r
ORDER BY month, kind, requestsByDimension;
