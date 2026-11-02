"""Pruebas LOCALES: parser MySQL y lógica sobre SQLite en memoria, nunca MySQL real."""
import calendar
import itertools
import json
from pathlib import Path
import sqlite3
import subprocess
import unittest
import sqlglot

ROOT = Path(__file__).resolve().parent


class QueryTests(unittest.TestCase):
    def test_query_and_all_subsets(self):
        original = (ROOT / 'GT_clientes_unicos.sql').read_text(encoding='utf-8')
        tree = sqlglot.parse_one(original, read='mysql')
        self.assertEqual(len(sqlglot.parse(original, read='mysql')), 1)
        self.assertEqual([x.alias_or_name for x in tree.this.expressions],
                         ['month', 'periodEnd', 'kind', 'clientCount', 'requestsByDimension', 'snapshotAt'])
        # Adaptaciones EXPLÍCITAS de primitivas del motor para probar la lógica relacional.
        sql = tree.sql(dialect='sqlite')
        sql = sql.replace("DATE_SUB(CURRENT_TIMESTAMP, '6', HOUR)", "'2026-11-02 12:00:00'")
        sql = sql.replace("DATE_SUB(og.fechaCreacion, '6', HOUR)", "DATETIME(og.fechaCreacion, '-6 hours')")
        sql = sql.replace('CURRENT_TIMESTAMP', "'2026-11-02 18:00:00'")
        sql = sql.replace('JSON_ARRAYAGG(', 'JSON_GROUP_ARRAY(').replace('JSON_TYPE(', 'MX_JSON_TYPE(')
        sql = sql.replace('CAST(membresia AS CHAR CHARACTER SET utf8mb4)', 'CAST(membresia AS TEXT)')
        db = sqlite3.connect(':memory:')
        db.create_collation('utf8mb4_bin', lambda a,b: (a > b) - (a < b))
        db.create_function('MX_JSON_TYPE', 1, lambda s: 'STRING' if s is not None and isinstance(json.loads(s), str) else 'OTHER')
        def last_day(s):
            y,m = map(int,s[:7].split('-'))
            return f'{y:04}-{m:02}-{calendar.monthrange(y,m)[1]:02}'
        db.create_function('LAST_DAY', 1, last_day)
        db.create_function('OCTET_LENGTH', 1, lambda s:len(s.encode('utf-8')) if s else 0)
        db.executescript('''ATTACH DATABASE ':memory:' AS "originador-dev";
          ATTACH DATABASE ':memory:' AS "maxi-prod";
          CREATE TABLE "originador-dev".originacion_flujo(id INTEGER PRIMARY KEY,fechaCreacion TEXT,fk_usuario_creacion INTEGER);
          CREATE TABLE "originador-dev".originacion_formulario_captura(idOriginacionFlujo INTEGER,formularioCapturaJson TEXT);
          CREATE TABLE "maxi-prod".usuario(pk_usuario INTEGER PRIMARY KEY,fk_sucursal INTEGER);
          CREATE TABLE "maxi-prod".sucursal(pk_sucursal INTEGER PRIMARY KEY,nombre TEXT,fk_distribuidor INTEGER);
          CREATE TABLE "maxi-prod".distribuidor(pk_distribuidor INTEGER PRIMARY KEY,nombre TEXT);''')
        db.executemany('INSERT INTO "maxi-prod".distribuidor VALUES(?,?)', [(1,'D1'),(2,'D2')])
        db.executemany('INSERT INTO "maxi-prod".sucursal VALUES(?,?,?)', [(1,'X',1),(2,'Y',1),(3,'Z',2)])
        db.executemany('INSERT INTO "maxi-prod".usuario VALUES(?,?)', [(101,1),(102,2),(103,3),(1,1)])
        # A=3 solicitudes, B=2, C=1. Un formulario repetido no crea otra solicitud.
        events = [(1,'2026-10-10 12:00:00',101,'A'),(2,'2026-10-11 12:00:00',102,'A'),
                  (3,'2026-10-12 12:00:00',103,'A'),(4,'2026-10-12 12:00:00',101,'B'),
                  (5,'2026-10-13 12:00:00',102,'B'),(6,'2026-10-14 12:00:00',103,'C'),
                  (7,'2026-11-01 05:59:59',101,'D'), # 31 octubre por ajuste -6h
                  (8,'2026-11-01 06:00:00',102,'A'), # 1 noviembre
                  (9,'2026-11-10 12:00:00',101,'FUTURE'),
                  (10,'2026-10-12 12:00:00',1,'INTERNAL'),
                  (11,'2026-11-01 12:00:00',101,''),
                  (12,'2026-11-01 12:00:00',103,'CONFLICT'),
                  (13,'2026-10-15 12:00:00',101,'E'),(14,'2026-10-16 12:00:00',102,'E')]
        db.executemany('INSERT INTO "originador-dev".originacion_flujo VALUES(?,?,?)', [e[:3] for e in events])
        captures = [(e[0],json.dumps({'docIdent':e[3]})) for e in events]
        captures += [(1,json.dumps({'docIdent':'A'})),(12,json.dumps({'docIdent':'OTHER'}))]
        db.executemany('INSERT INTO "originador-dev".originacion_formulario_captura VALUES(?,?)',captures)
        rows = db.execute(sql).fetchall()
        self.assertTrue(rows)
        profiles=[(row[0],row[4]) for row in rows if row[2]=='identified']
        self.assertLess(len(set(profiles)),len(profiles))
        self.assertFalse(any(secret in str(rows) for secret in ['CONFLICT','INTERNAL','docIdent','FUTURE']))
        headers = ['month','periodEnd','kind','clientCount','requestsByDimension','snapshotAt']
        # Comparar a un oráculo de eventos independiente para todas las uniones de dimensiones.
        def aggregate(month, ds, bs):
            total=clients=repeat=missing=0
            for m,end,kind,count,members,snapshot in rows:
                if m != month or kind == 'coverage': continue
                q=sum(p['requests'] for p in json.loads(members)
                      if (ds is None or p['distributor'] in ds) and (bs is None or p['branch'] in bs))
                if kind=='identified':
                    total+=q*count;clients+=count if q else 0;repeat+=count if q>1 else 0
                else: total+=q;missing+=q
            return total,clients,repeat,missing
        def subsets(values):
            return [None]+[list(s) for n in range(len(values)+1) for s in itertools.combinations(values,n)]
        valid=[]
        for rid,date,user,doc in events:
            if user==1 or rid==9: continue
            month='2026-10' if rid==7 else date[:7]
            d,b={101:('D1','X'),102:('D1','Y'),103:('D2','Z')}[user]
            valid.append((rid,month,d,b,None if rid in (11,12) else doc))
        cases=0
        for month in ['2026-10','2026-11']:
            for ds in subsets(['D1','D2']):
                for bs in subsets(['X','Y','Z']):
                    selected=[r for r in valid if r[1]==month and (ds is None or r[2] in ds) and (bs is None or r[3] in bs)]
                    counts={doc:sum(r[4]==doc for r in selected) for doc in set(r[4] for r in selected) if doc is not None}
                    self.assertEqual(aggregate(month,ds,bs),(len(selected),len(counts),sum(n>1 for n in counts.values()),sum(r[4] is None for r in selected)))
                    cases+=1
        self.assertEqual(aggregate('2026-10',None,['X','Y','Z']), (9,5,3,0))
        # Quitar la solicitud del borde temporal para verificar exactamente el ejemplo 3/6/2.00.
        self.assertEqual(aggregate('2026-10',['D1'],['X','Y']), (7,4,3,0))
        process=subprocess.run(['node',str(ROOT/'test_apps_script.mjs')],
            input=json.dumps([headers]+[[str(x) for x in row] for row in rows]),text=True,capture_output=True)
        self.assertEqual(process.returncode,0,process.stdout+'\n'+process.stderr)
        print(f'PASS: MySQL parse; SQLite lógico adaptado; {cases} subconjuntos; '+process.stdout.strip())


if __name__=='__main__': unittest.main()
