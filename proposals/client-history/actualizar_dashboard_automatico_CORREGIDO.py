# PROPUESTA COMPLETA. NO INSTALADA NI EJECUTADA.
# Copia de actualizar_dashboard_automatico_CORREGIDO.py con un tercer CSV opcional.
# Conserva credenciales existentes, rutas, dos consultas y mecanismo de manifiestos.
import csv
import json
import hashlib
import shutil
import uuid
import os
import sys
import logging
import mysql.connector
import keyring

from pathlib import Path
from datetime import datetime, date, timezone
from decimal import Decimal
from logging.handlers import RotatingFileHandler

# ==================================================
# CONFIGURACION
# ==================================================
CARPETA = Path(__file__).resolve().parent
CARPETA_DRIVE = Path(r"G:\Mi unidad\MAXIKASH_SYNC")
CARPETA_LOCAL = CARPETA / "EXPORTACIONES"
CARPETA_LOGS = CARPETA / "LOGS"
CONSULTAS = {
    "GT_solicitudes": "GT_solicitudes.sql",
    "GT_ofertas": "GT_ofertas.sql",
}
COLUMNAS_ESPERADAS = {"GT_solicitudes": 22, "GT_ofertas": 22, "GT_clientes_unicos": 6}
TAMANO_BLOQUE = 1000
SERVICIO_CREDENCIAL = "MAXIKASH_RDS"
USUARIO_MYSQL = "rodrigo.marin"
VARIABLE_HOST = "MAXIKASH_RDS_HOST"


def configurar_logs():
    CARPETA_LOGS.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("maxikash")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    formato = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
    consola = logging.StreamHandler(sys.stdout)
    consola.setFormatter(formato)
    archivo = RotatingFileHandler(
        CARPETA_LOGS / "actualizar_dashboard.log",
        maxBytes=5_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    archivo.setFormatter(formato)
    logger.addHandler(consola)
    logger.addHandler(archivo)
    return logger


def convertir_valor(valor):
    if valor is None:
        return ""
    if isinstance(valor, datetime):
        return valor.isoformat(sep=" ")
    if isinstance(valor, date):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return str(valor)
    if isinstance(valor, bytes):
        return valor.decode("utf-8", errors="replace")
    return valor


def calcular_sha256(ruta):
    huella = hashlib.sha256()
    with open(ruta, "rb") as archivo:
        for bloque in iter(lambda: archivo.read(1024 * 1024), b""):
            huella.update(bloque)
    return huella.hexdigest()


def exportar_consulta(conexion, nombre, archivo_sql, carpeta_ejecucion, run_id, log):
    ruta_sql = CARPETA / archivo_sql
    if not ruta_sql.is_file():
        raise FileNotFoundError(f"No existe: {ruta_sql}")
    consulta = ruta_sql.read_text(encoding="utf-8-sig").strip()
    if not consulta:
        raise ValueError(f"La consulta {nombre} esta vacia")
    nombre_csv = f"{nombre}_{run_id}.csv"
    ruta_csv = carpeta_ejecucion / nombre_csv
    cursor = None
    cantidad = 0
    try:
        cursor = conexion.cursor()
        cursor.execute(consulta)
        if cursor.description is None:
            raise ValueError(f"La consulta {nombre} no devolvio columnas")
        encabezados = [columna[0] for columna in cursor.description]
        if nombre == "GT_clientes_unicos" and encabezados != [
            "month", "periodEnd", "kind", "clientCount", "requestsByDimension", "snapshotAt"
        ]:
            raise ValueError("Encabezados del agregado de clientes no coinciden")
        columnas = len(encabezados)
        if columnas != COLUMNAS_ESPERADAS[nombre]:
            raise ValueError(
                f"{nombre}: se esperaban {COLUMNAS_ESPERADAS[nombre]} "
                f"columnas, pero llegaron {columnas}"
            )
        with open(ruta_csv, "w", newline="", encoding="utf-8-sig") as archivo:
            escritor = csv.writer(archivo)
            escritor.writerow(encabezados)
            while True:
                registros = cursor.fetchmany(TAMANO_BLOQUE)
                if not registros:
                    break
                for registro in registros:
                    escritor.writerow([convertir_valor(valor) for valor in registro])
                    cantidad += 1
        if cantidad == 0:
            raise ValueError(f"{nombre}: la consulta no devolvio registros")
        huella = calcular_sha256(ruta_csv)
        log.info("OK: %s | Registros: %s | Columnas: %s | SHA-256: %s", nombre, cantidad, columnas, huella)
        return {"archivo": nombre_csv, "registros": cantidad, "columnas": columnas, "sha256": huella}
    finally:
        if cursor is not None:
            cursor.close()


def main(log):
    log.info("DASHBOARD MAXIKASH - EXPORTACION AUTOMATICA")
    for archivo_sql in CONSULTAS.values():
        if not (CARPETA / archivo_sql).is_file():
            raise FileNotFoundError(f"Falta el archivo SQL: {archivo_sql}")
    if not CARPETA_DRIVE.is_dir():
        raise FileNotFoundError(f"No se encuentra Google Drive: {CARPETA_DRIVE}")

    host = os.environ.get(VARIABLE_HOST, "").strip()
    if not host:
        raise RuntimeError(
            f"Falta configurar la variable de entorno {VARIABLE_HOST}. "
            "No se iniciara la exportacion."
        )
    password = keyring.get_password(SERVICIO_CREDENCIAL, USUARIO_MYSQL)
    if not password:
        raise RuntimeError(
            "No se encontro la contrasena en Windows Credential Manager "
            f"(servicio {SERVICIO_CREDENCIAL}, usuario {USUARIO_MYSQL})."
        )

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + uuid.uuid4().hex[:8]
    carpeta_ejecucion = CARPETA_LOCAL / run_id
    carpeta_ejecucion.mkdir(parents=True, exist_ok=False)
    conexion = None
    try:
        log.info("Conectando a MySQL...")
        conexion = mysql.connector.connect(
            host=host,
            port=3306,
            user=USUARIO_MYSQL,
            password=password,
            connection_timeout=20,
            use_pure=True,
        )
        log.info("CONEXION EXITOSA")
        resultados = {}
        for nombre, archivo_sql in CONSULTAS.items():
            log.info("Ejecutando %s...", nombre)
            resultados[nombre] = exportar_consulta(
                conexion, nombre, archivo_sql, carpeta_ejecucion, run_id, log
            )
        # Tercer archivo opcional del MISMO run_id. No altera las dos consultas.
        # Si falla, se siguen publicando las dos tablas originales, sin clientes.
        try:
            resultados["GT_clientes_unicos"] = exportar_consulta(
                conexion, "GT_clientes_unicos", "GT_clientes_unicos.sql",
                carpeta_ejecucion, run_id, log
            )
        except Exception:
            log.warning("Clientes: no se publica el agregado de esta ejecución; originales conservados.")
    finally:
        if conexion is not None:
            try:
                conexion.close()
                log.info("CONEXION MYSQL CERRADA")
            except mysql.connector.Error as error:
                log.warning("Error al cerrar MySQL: %s", error)

    manifiesto = {
        "version": 1,
        "run_id": run_id,
        "fecha_utc": datetime.now(timezone.utc).isoformat(),
        "archivos": resultados,
    }
    nombre_manifiesto = f"MANIFIESTO_{run_id}.json"
    ruta_manifiesto = carpeta_ejecucion / nombre_manifiesto
    ruta_manifiesto.write_text(
        json.dumps(manifiesto, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    log.info("Copiando CSV a Google Drive...")
    for nombre, datos in resultados.items():
        origen = carpeta_ejecucion / datos["archivo"]
        destino = CARPETA_DRIVE / datos["archivo"]
        shutil.copyfile(origen, destino)
        if calcular_sha256(destino) != datos["sha256"]:
            raise IOError(f"Verificacion local fallida: {nombre}")
        log.info("CSV copiado y verificado: %s", datos["archivo"])

    destino_manifiesto = CARPETA_DRIVE / nombre_manifiesto
    shutil.copyfile(ruta_manifiesto, destino_manifiesto)
    if calcular_sha256(destino_manifiesto) != calcular_sha256(ruta_manifiesto):
        raise IOError("Verificacion local del manifiesto fallida")
    log.info("EXPORTACION LOCAL COMPLETADA | RUN_ID=%s", run_id)
    for nombre, datos in resultados.items():
        log.info("%s: %s registros", nombre, datos["registros"])
    log.info("Carpeta Drive: %s", CARPETA_DRIVE)
    log.info("Manifiesto: %s", nombre_manifiesto)
    log.info("Esperar sincronizacion de Google Drive; Apps Script debe validar hashes antes de importar.")


def probar_clientes_sin_publicar(log):
    """Tras autorización: consulta solo clientes y guarda CSV LOCAL; no toca Drive/Sheets."""
    host = os.environ.get(VARIABLE_HOST, "").strip()
    password = keyring.get_password(SERVICIO_CREDENCIAL, USUARIO_MYSQL)
    if not host or not password:
        raise RuntimeError("Falta la configuración de acceso existente")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + uuid.uuid4().hex[:8]
    destino = CARPETA_LOCAL / "PRUEBA_CLIENTES" / run_id
    destino.mkdir(parents=True, exist_ok=False)
    conexion = mysql.connector.connect(
        host=host,
        port=3306,
        user=USUARIO_MYSQL,
        password=password,
        connection_timeout=20,
        use_pure=True,
    )
    try:
        cursor = conexion.cursor()
        try:
            cursor.execute("SELECT VERSION()")
            version = str(cursor.fetchone()[0])
        finally:
            cursor.close()
        import re
        match = re.match(r"(\d+)\.(\d+)\.(\d+)", version)
        if "mariadb" in version.lower() or not match or tuple(map(int,match.groups())) < (8,0,14):
            raise RuntimeError("La propuesta requiere MySQL >= 8.0.14; no se ejecutó la consulta de clientes")
        resultado = exportar_consulta(conexion,"GT_clientes_unicos","GT_clientes_unicos.sql",destino,run_id,log)
        (destino / "VALIDACION_LOCAL.json").write_text(
            json.dumps({"run_id":run_id,"archivo":resultado,"publicado":False},indent=2),encoding="utf-8")
        log.info("PRUEBA LOCAL: CSV de clientes validado. No se copiaron archivos a Drive ni se publicó manifiesto.")
    finally:
        conexion.close()


if __name__ == "__main__":
    logger = configurar_logs()
    try:
        if "--validar-clientes" in sys.argv:
            probar_clientes_sin_publicar(logger)
        else:
            main(logger)
    except Exception:
        logger.exception("ERROR DURANTE LA EJECUCION")
        sys.exit(1)
