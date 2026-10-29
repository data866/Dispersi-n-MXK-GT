"""Crea el primer data.json sin abrir una conexión a MySQL.

Solo se usa para arrancar el nuevo proyecto usando el último corte estático ya
generado en la PC. No modifica el proyecto anterior ni expone datos personales.
Las siguientes actualizaciones se hacen con refresh.py.
"""
import base64
import gzip
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(r"C:\Users\amigo_ulktdzn\Music\transferencia\dashboard-distribuidores-gt\api\_datos.mjs")


def unpack():
    text = SOURCE.read_text(encoding="utf-8")
    b64 = re.search(r'GZ_B64 = "([^"]+)"', text).group(1)
    return json.loads(gzip.decompress(base64.b64decode(b64)))


def label(dictionary, value):
    return dictionary[value] if isinstance(value, int) else str(value or "Sin dato")


def date_at(bucket, index):
    return f"{bucket['y'][index]:04d}-{bucket['m'][index]:02d}-{bucket['dd'][index]:02d}"


def request_status(value):
    value = value.upper()
    if "AUTORIZ" in value or "APROBAD" in value:
        return "APROBADO"
    if "RECHAZ" in value:
        return "RECHAZADO"
    return "NO TERMINO PROCESO"


def main():
    raw = unpack(); d = raw["dict"]
    requests = []
    for i in range(len(raw["C"]["y"])):
        c = raw["C"]
        requests.append({"date": date_at(c, i), "status": request_status(label(d, c["e"][i])),
                         "distributor": label(d, c["d"][i]), "branch": label(d, c["s"][i]), "source": "histórico"})
    dispersions = {}
    for i in range(len(raw["D"]["y"])):
        r = raw["D"]; day = date_at(r, i); item = dispersions.setdefault(day, {"date": day, "credits": 0, "amount": 0})
        item["credits"] += 1; item["amount"] += float(r["mo"][i] or 0)
    offers = []
    for i in range(len(raw["T"]["y"])):
        r = raw["T"]
        offers.append({"id": r.get("id", [None] * len(r["y"]))[i], "date": date_at(r, i),
                       "stage": label(d, r["et"][i]), "distributor": label(d, r["d"][i]),
                       "branch": label(d, r["s"][i]), "brand": "—", "model": "—",
                       "amount": float(r["mo"][i] or 0), "dispersedAt": None})
    daily = {}
    for item in requests:
        row = daily.setdefault(item["date"], {"date": item["date"], "total": 0, "approved": 0, "rejected": 0, "unfinished": 0})
        row["total"] += 1
        row[{"APROBADO": "approved", "RECHAZADO": "rejected"}.get(item["status"], "unfinished")] += 1
    def rollup(field):
        values = {}
        for row in requests:
            x = values.setdefault(row[field], {"name": row[field], "total": 0, "approved": 0, "rejected": 0, "unfinished": 0})
            x["total"] += 1; x[{"APROBADO": "approved", "RECHAZADO": "rejected"}.get(row["status"], "unfinished")] += 1
        return sorted(values.values(), key=lambda x: x["total"], reverse=True)
    targets = json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))["monthlyTargets"]
    payload = {"updatedAt": raw.get("generado_en") or datetime.now().isoformat(), "year": 2026, "requests": requests,
               "dailyRequests": sorted(daily.values(), key=lambda x: x["date"]), "byDistributor": rollup("distributor"),
               "byBranch": rollup("branch"), "dispersions": sorted(dispersions.values(), key=lambda x: x["date"]),
               "inventory": [], "offers": offers, "monthlyTargets": targets}
    path = ROOT / "public" / "data.json"; path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Corte inicial listo: {len(requests)} solicitudes y {len(offers)} ofertas pendientes.")


if __name__ == "__main__":
    main()
