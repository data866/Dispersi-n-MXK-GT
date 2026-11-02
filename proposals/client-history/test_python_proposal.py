"""Verificación estática y hashes: NO importa ni ejecuta el exportador propuesto."""
import ast
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent
ORIGINALS = Path('C:/Users/amigo_ulktdzn/Desktop/Guate')


class ProposalTests(unittest.TestCase):
    def test_compile_without_execution(self):
        source=(ROOT/'actualizar_dashboard_automatico_CORREGIDO.py').read_text(encoding='utf-8')
        compile(source,'exportador_propuesto','exec')
        tree=ast.parse(source)
        assignments={n.targets[0].id: n.value for n in tree.body
                     if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name)}
        self.assertEqual(ast.literal_eval(assignments['CONSULTAS']),
                         {'GT_solicitudes':'GT_solicitudes.sql','GT_ofertas':'GT_ofertas.sql'})
        self.assertEqual(ast.literal_eval(assignments['COLUMNAS_ESPERADAS'])['GT_clientes_unicos'],6)
        self.assertFalse(any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and
                         n.func.attr in ('create_task','delete_task','register_task') for n in ast.walk(tree)))

    def test_originals_unchanged(self):
        hashes=json.loads((ROOT/'originales.sha256.json').read_text(encoding='utf-8'))
        for name,expected in hashes.items():
            self.assertEqual(hashlib.sha256((ORIGINALS/name).read_bytes()).hexdigest(),expected,name)

    def test_existing_authentication_and_helpers_preserved(self):
        original=ast.parse((ORIGINALS/'actualizar_dashboard_automatico_CORREGIDO.py').read_text(encoding='utf-8-sig'))
        proposed=ast.parse((ROOT/'actualizar_dashboard_automatico_CORREGIDO.py').read_text(encoding='utf-8'))
        def functions(t): return {n.name:n for n in t.body if isinstance(n,ast.FunctionDef)}
        a,b=functions(original),functions(proposed)
        for name in ['configurar_logs','convertir_valor','calcular_sha256']:
            self.assertEqual(ast.dump(a[name]),ast.dump(b[name]))
        def calls(t,name):
            return [ast.dump(n) for n in ast.walk(t) if isinstance(n,ast.Call) and
                    ((isinstance(n.func,ast.Attribute) and n.func.attr==name) or
                     (isinstance(n.func,ast.Name) and n.func.id==name))]
        for name in ['connect','get_password']:
            self.assertTrue(calls(proposed,name))
            self.assertTrue(all(call==calls(original,name)[0] for call in calls(proposed,name)))


if __name__=='__main__': unittest.main()
