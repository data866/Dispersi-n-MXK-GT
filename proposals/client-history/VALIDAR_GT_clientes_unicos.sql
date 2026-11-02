-- PROPUESTA: solo lectura. MySQL 8. No sustituye GT_solicitudes.sql.
-- Validación directa de conteos para comparar con el agregado de cohortes.
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
parametros AS (
    -- SOLO REVISIÓN LOCAL. Tras autorización, editar este SELECT para cada caso.
    -- NULL = todos. Para una unión exacta: JSON_ARRAY con los nombres reales.
    SELECT DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR), '%Y-%m') AS mes,
           NULL AS distribuidores_json, NULL AS sucursales_json
),
seleccion AS (
    SELECT f.* FROM flujos f CROSS JOIN parametros p
    WHERE DATE_FORMAT(f.fecha, '%Y-%m') = p.mes
      AND (p.distribuidores_json IS NULL OR JSON_CONTAINS(p.distribuidores_json, JSON_QUOTE(f.distribuidor)))
      AND (p.sucursales_json IS NULL OR JSON_CONTAINS(p.sucursales_json, JSON_QUOTE(f.sucursal)))
),
repetidos AS (
    SELECT documento FROM seleccion WHERE documento IS NOT NULL
    GROUP BY documento HAVING COUNT(DISTINCT id_flujo) > 1
)
SELECT COUNT(DISTINCT id_flujo) AS totalRequests,
       COUNT(DISTINCT documento) AS identifiedClients,
       COUNT(DISTINCT CASE WHEN documento IS NULL THEN id_flujo END) AS missingIdentityRequests,
       COUNT(DISTINCT CASE WHEN ambiguo = 1 THEN id_flujo END) AS ambiguousIdentityRequests,
       (SELECT COUNT(*) FROM repetidos) AS repeatClients,
       CASE WHEN COUNT(DISTINCT CASE WHEN documento IS NULL THEN id_flujo END) = 0
                  AND COUNT(DISTINCT documento) > 0
            THEN ROUND(COUNT(DISTINCT id_flujo) / COUNT(DISTINCT documento), 2)
       END AS requestsPerClient
FROM seleccion;
