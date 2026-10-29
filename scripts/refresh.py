"""Genera el archivo estático del tablero Dispersión MXK GT.

La conexión MySQL solo vive dentro del bloque ``with``: cursor y conexión se
cierran aun si la actualización falla. Vercel nunca recibe credenciales ni se
conecta a MySQL en tiempo real.
"""
from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pymysql
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
LOCAL_ENV = ROOT / ".env"
FALLBACK_ENV = Path(r"C:\Users\amigo_ulktdzn\Music\transferencia\dashboard-distribuidores-gt\.env")
OUT = ROOT / "public" / "data.json"
TARGETS = ROOT / "data" / "targets.json"
YEAR = 2026
UTC_TO_GT = timedelta(hours=6)


def as_json(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"No se puede serializar {type(value).__name__}")


def clean(value, fallback="Sin dato"):
    text = "" if value is None else str(value).strip()
    return text or fallback


def local_time(value):
    return value - UTC_TO_GT if isinstance(value, datetime) else None


def status_from_buro(value):
    text = clean(value, "").upper()
    # Coincide con los campos calculados de Looker Studio: igualdad exacta.
    if text == "APROBADO":
        return "APROBADO"
    if text == "RECHAZADO":
        return "RECHAZADO"
    return "NO TERMINO PROCESO"


def connect():
    load_dotenv(LOCAL_ENV if LOCAL_ENV.exists() else FALLBACK_ENV)
    missing = [key for key in ("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME") if not os.getenv(key)]
    if missing:
        raise RuntimeError("Faltan credenciales locales: " + ", ".join(missing))
    options = {
        "host": os.environ["DB_HOST"], "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.environ["DB_USER"], "password": os.environ["DB_PASSWORD"],
        "database": os.environ["DB_NAME"], "charset": "utf8mb4",
        "cursorclass": pymysql.cursors.DictCursor, "connect_timeout": 30, "read_timeout": 600,
    }
    if os.getenv("DB_SSL", "").strip().lower() == "true":
        import ssl
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        options["ssl"] = ctx
    return pymysql.connect(**options)


# Consulta copiada de la conexión GT_solicitudes de Looker Studio.
# La CTE clientes_unicos es la diferencia determinante: conserva un solo
# flujo (el más reciente) por docIdent antes de contar los indicadores.
REQUESTS_SQL = """
WITH clientes_unicos AS (
  SELECT MAX(og.id) AS id_flujo
  FROM `originador-dev`.originacion_flujo og
  INNER JOIN `originador-dev`.originacion_formulario_captura rfc
    ON og.id = rfc.idOriginacionFlujo
  WHERE rfc.formularioCapturaJson ->> '$.docIdent' IS NOT NULL
  GROUP BY rfc.formularioCapturaJson ->> '$.docIdent'
), oferta_unica AS (
  SELECT idOriginacionFlujo, MAX(id) AS id_oferta
  FROM `originador-dev`.originacion_ofertas
  GROUP BY idOriginacionFlujo
)
SELECT og.id AS solicitud, og.idOferta,
  DATE(DATE_SUB(og.fechaCreacion, INTERVAL 6 HOUR)) AS fecha_solicitud,
  WEEKOFYEAR(og.fechaCreacion) AS num_semana,
  (YEAR(og.fechaCreacion) * 100) + WEEKOFYEAR(og.fechaCreacion) AS yw,
  CASE WHEN cb.estatusBuro IS NULL THEN 'NO TERMINO PROCESO' ELSE cb.estatusBuro END AS buro,
  u.pk_usuario,
  UPPER(CONCAT_WS(' ', u.primer_nombre, u.segundo_nombre, u.apellido_paterno, u.apellido_materno)) AS usuario,
  s.pk_sucursal, UPPER(s.nombre) AS sucursal,
  d.pk_distribuidor, UPPER(d.nombre) AS distribuidor,
  IF(og.idOriginacionIdCard IS NOT NULL OR og.idConsultaValidacionIdentidad IS NOT NULL, 1, 0) AS valIdentidad,
  1 AS cantidad,
  rfc.formularioCapturaJson ->> '$.docIdent' AS doc_ident,
  CONCAT_WS(' ', rfc.formularioCapturaJson ->> '$.primerNombre', rfc.formularioCapturaJson ->> '$.segundoNombre', rfc.formularioCapturaJson ->> '$.primerApellido', rfc.formularioCapturaJson ->> '$.segundoApellido') AS cliente,
  IF(og.idOriginacionFormularioCaptura IS NULL, 0, 1) AS enviaFormulario,
  IF(og.idOriginacionNip IS NULL, 0, 1) AS envioNip,
  IF(og.idOriginacionConfirmacionNip IS NULL, 0, 1) AS confirmaNip,
  IF(og.idOriginacionConsultaBuro IS NULL, 0, 1) AS respuestaBuro,
  IF(o1.estatusMaxi IS NULL, 0, 1) AS sinOferta,
  CASE
    WHEN og.idOriginacionIdCard IS NULL AND og.idConsultaValidacionIdentidad IS NULL
      AND og.idOriginacionFormularioCaptura IS NULL AND og.idOriginacionConfirmacionNip IS NULL
      AND og.idOriginacionConsultaBuro IS NULL THEN '1 Sin Proceso'
    WHEN og.idOriginacionFormularioCaptura IS NULL THEN '2 Sin Formulario'
    WHEN og.idOriginacionConfirmacionNip IS NULL THEN '3 No confirma NIP'
    WHEN og.idOriginacionConsultaBuro IS NULL THEN '4 Sin Respuesta Buro'
    WHEN cb.estatusBuro LIKE '%RECHAZADO%' THEN '5 Rechazado'
    WHEN o1.estatusMaxi IS NULL THEN '6 No selecciona Oferta'
    ELSE '7 Completo'
  END AS seguimiento
FROM clientes_unicos cu
INNER JOIN `originador-dev`.originacion_flujo og ON cu.id_flujo = og.id
LEFT JOIN `originador-dev`.originacion_consulta_buro ocb ON og.id = ocb.idOriginacionFlujo
LEFT JOIN `originador-dev`.originacion_formulario_captura rfc ON og.id = rfc.idOriginacionFlujo
LEFT JOIN `originador-dev`.consulta_buro cb ON ocb.idConsultaBuro = cb.id
LEFT JOIN `maxi-prod`.usuario u ON og.fk_usuario_creacion = u.pk_usuario
LEFT JOIN `maxi-prod`.sucursal s ON u.fk_sucursal = s.pk_sucursal
LEFT JOIN `maxi-prod`.distribuidor d ON s.fk_distribuidor = d.pk_distribuidor
LEFT JOIN oferta_unica ou ON og.id = ou.idOriginacionFlujo
LEFT JOIN `originador-dev`.originacion_ofertas o1 ON ou.id_oferta = o1.id
WHERE u.pk_usuario NOT IN (1,2,4,5,7,8,13,16,17,36,38)
"""

OFFERS_SQL = """
SELECT o.id_oferta, o.fk_persona, TRIM(p.docident) AS dpi, o.fecha_hora AS fecha_oferta,
       pb.respuesta_buro AS buro, d.nombre AS distribuidor, s.nombre AS sucursal,
       o.etapa, o.monto_financiar, o.precio_moto, o.enganche, o.marca_moto, o.modelo_moto,
       bd.fecha_creacion AS fecha_dispersion
FROM oferta o
LEFT JOIN persona p ON p.id_persona=o.fk_persona
LEFT JOIN persona_buro pb ON pb.pk_buro=o.fk_buro
LEFT JOIN usuario u ON u.pk_usuario=o.fk_usuario_creacion
LEFT JOIN sucursal s ON s.pk_sucursal=u.fk_sucursal
LEFT JOIN distribuidor d ON d.pk_distribuidor=s.fk_distribuidor
LEFT JOIN (SELECT id_oferta, MIN(fecha_creacion) AS fecha_creacion
           FROM bitacora_dispersiones WHERE estatus=1 GROUP BY id_oferta) bd ON bd.id_oferta=o.id_oferta
WHERE o.fk_persona IS NOT NULL
"""


def add_row(bucket, row):
    day = row["date"]
    bucket[day]["total"] += 1
    bucket[day][row["status"].lower().replace(" ", "_")] += 1


def summary(rows, dimension):
    result = defaultdict(lambda: {"name": "", "total": 0, "approved": 0, "rejected": 0, "unfinished": 0})
    for row in rows:
        key = row[dimension]
        item = result[key]; item["name"] = key; item["total"] += 1
        if row["status"] == "APROBADO": item["approved"] += 1
        elif row["status"] == "RECHAZADO": item["rejected"] += 1
        else: item["unfinished"] += 1
    return sorted(result.values(), key=lambda item: item["total"], reverse=True)


def main():
    # Both objects are closed deterministically once the reads finish.
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(REQUESTS_SQL); raw_requests = list(cursor.fetchall())
            cursor.execute(OFFERS_SQL); offers = list(cursor.fetchall())

    requests = []
    for item in raw_requests:
        raw_date = item.get("fecha_solicitud")
        if isinstance(raw_date, datetime): raw_date = raw_date.date()
        if not isinstance(raw_date, date): continue
        buro = clean(item.get("buro"), "NO TERMINO PROCESO").upper()
        requests.append({
            "id": item.get("solicitud"), "date": raw_date.isoformat(), "buro": buro,
            "status": status_from_buro(buro), "week": item.get("yw"),
            "followup": clean(item.get("seguimiento")),
            "distributor": clean(item.get("distribuidor"), "SIN DISTRIBUIDOR"),
            "branch": clean(item.get("sucursal"), "SIN SUCURSAL"),
            "user": clean(item.get("usuario"), "SIN USUARIO"), "doc": clean(item.get("doc_ident"), ""),
            "client": clean(item.get("cliente"), ""), "offerId": item.get("idOferta"),
        })

    daily = defaultdict(lambda: {"total": 0, "approved": 0, "rejected": 0, "unfinished": 0})
    for row in requests:
        daily[row["date"]]["total"] += 1
        if row["status"] == "APROBADO": daily[row["date"]]["approved"] += 1
        elif row["status"] == "RECHAZADO": daily[row["date"]]["rejected"] += 1
        else: daily[row["date"]]["unfinished"] += 1

    dispersions = defaultdict(lambda: {"credits": 0, "amount": 0})
    inventory = Counter()
    offers_detail = []
    for offer in offers:
        inventory[clean(offer.get("etapa"), "SIN ETAPA")] += 1
        disp = offer.get("fecha_dispersion")
        if isinstance(disp, datetime) and disp.year == YEAR:
            key = disp.date().isoformat()
            dispersions[key]["credits"] += 1
            dispersions[key]["amount"] += float(offer.get("monto_financiar") or 0)
        offers_detail.append({
            "id": offer["id_oferta"], "date": local_time(offer.get("fecha_oferta")).date().isoformat() if local_time(offer.get("fecha_oferta")) else None,
            "stage": clean(offer.get("etapa"), "SIN ETAPA"), "distributor": clean(offer.get("distribuidor"), "SIN DISTRIBUIDOR"),
            "branch": clean(offer.get("sucursal"), "SIN SUCURSAL"), "brand": clean(offer.get("marca_moto")), "model": clean(offer.get("modelo_moto")),
            "amount": float(offer.get("monto_financiar") or 0), "dispersedAt": disp.date().isoformat() if isinstance(disp, datetime) else None,
        })

    targets = json.loads(TARGETS.read_text(encoding="utf-8"))["monthlyTargets"]
    payload = {
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "year": YEAR, "requests": requests, "dailyRequests": [{"date": key, **value} for key, value in sorted(daily.items())],
        "byDistributor": summary(requests, "distributor"), "byBranch": summary(requests, "branch"),
        "dispersions": [{"date": key, **value} for key, value in sorted(dispersions.items())],
        "inventory": [{"stage": stage, "total": total} for stage, total in inventory.most_common()],
        "offers": offers_detail, "monthlyTargets": targets,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, default=as_json, separators=(",", ":")), encoding="utf-8")
    print(f"Actualizado: {len(requests)} solicitudes, {sum(x['credits'] for x in dispersions.values())} dispersiones.")


if __name__ == "__main__":
    main()

