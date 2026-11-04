// Se ejecuta por test_sql.py con cohortes de prueba, NUNCA con Apps Script real.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateClientMetrics} from './public/client-metrics.mjs';
import {summaryView} from './public/summary-view.mjs';
import {validatePublic} from './api/data.mjs';

const rows=JSON.parse(fs.readFileSync(0,'utf8'));
const updatedAt='2026-11-02T12:01:00-06:00';
const source=fs.readFileSync(new URL('Clientes_Unicos.gs',import.meta.url),'utf8');
const baseline={schemaVersion:3,source:'Google Sheets / Apps Script',updatedAt,
  requests:[{date:'2026-10-01',week:'202640',distributor:'D1',branch:'X',user:'Nombre real de prueba',followup:'7 Completo',total:2,approved:2,rejected:0,unfinished:0}],
  offers:[],dispersions:[],historicalTotals:{requests:{total:2,approved:2,rejected:0,unfinished:0},activations:0,sales:0},monthlyTargets:{},dailyTargets:{}};
const runId='20261102T180000Z_1234abcd';
const csv=rows.map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
const bytes=Buffer.from('\ufeff'+csv);
const manifest={version:1,run_id:runId,archivos:{GT_solicitudes:{registros:2},GT_ofertas:{registros:0},GT_clientes_unicos:{archivo:`GT_clientes_unicos_${runId}.csv`,columnas:6,registros:rows.length-1,sha256:createHash('sha256').update(bytes).digest('hex')}}};
let lockAvailable=true;
const context=vm.createContext({console:{warn:()=>{}},DASH_SYNC:{libroId:'test',carpetaId:'test'},
  SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getLastRow:()=>2,getRange:()=>({getValues:()=>[['','PUBLICADO',2,0,`RUN_ID=${runId} | SHA-256 validado`]]})})})},
  DriveApp:{getFolderById:()=>({})},
  syncArchivoUnico_:(_folder,name)=>{
    const b=name.endsWith('.json')?Buffer.from(JSON.stringify(manifest)):bytes;
    return {getSize:()=>b.length,getBlob:()=>({getBytes:()=>[...b],getDataAsString:()=>b.toString('utf8')})};
  },
  syncSha256_:b=>createHash('sha256').update(Buffer.from(b)).digest('hex'),
  Utilities:{parseCsv:text=>{assert.equal(text,csv);return structuredClone(rows);}},
  LockService:{getScriptLock:()=>({tryLock:()=>lockAvailable,releaseLock:()=>{}})},
  construirSalidaPublicaMxk_:()=>structuredClone(baseline)});
vm.runInContext(source,context);
assert.deepEqual(JSON.parse(JSON.stringify(context.construirSalidaPublicaMxkConClientes_())),baseline);
vm.runInContext('MXK_CLIENTES.habilitado=true',context);
const parsed=context.mxkValidarCohortes_(rows,updatedAt);
const oct=context.calcularClientesParaFiltros_(parsed.cohortes,'2026-10',null,null);
assert.deepEqual(JSON.parse(JSON.stringify(oct)),{totalRequests:9,uniqueClients:5,missingIdentityRequests:0,repeatClients:3});
const subset=context.calcularClientesParaFiltros_(parsed.cohortes,'2026-10',null,['X','Y']);
assert.equal(subset.totalRequests,7);assert.equal(subset.uniqueClients,4);assert.equal(subset.repeatClients,3);
const empty=context.calcularClientesParaFiltros_(parsed.cohortes,'2026-10',null,[]);
assert.equal(empty.uniqueClients,0);assert.equal(empty.totalRequests,0);
assert.equal(context.calcularClientesParaFiltros_(parsed.cohortes,'2025-01',null,null),null);
// Ejemplo de negocio exacto: 3 clientes, 6 solicitudes, promedio 2.00.
const example=[{month:'2026-10',kind:'coverage',members:[]},
  ...[3,2,1].map(q=>({month:'2026-10',kind:'identified',clients:1,members:[{distributor:'D',branch:'S',requests:q}]}))];
const sample=context.calcularClientesParaFiltros_(example,'2026-10',null,null);
assert.equal(sample.totalRequests,6);assert.equal(sample.uniqueClients,3);
assert.equal((sample.totalRequests/sample.uniqueClients).toFixed(2),'2.00');assert.equal(sample.repeatClients,2);
const across=[{month:'2026-10',kind:'coverage',members:[]},{month:'2026-10',kind:'identified',clients:1,
  members:[{distributor:'D1',branch:'X',requests:1},{distributor:'D2',branch:'X',requests:1}]}];
assert.equal(context.calcularClientesParaFiltros_(across,'2026-10',null,['X']).uniqueClients,1);
assert.equal(context.calcularClientesParaFiltros_(across,'2026-10',null,['X']).totalRequests,2);
const output=JSON.parse(JSON.stringify(context.construirSalidaPublicaMxkConClientes_()));
validateClientMetrics(output.clientMetrics,updatedAt);validatePublic(output);
for(const row of output.clientMetrics.rows){
  const direct=context.calcularClientesParaFiltros_(parsed.cohortes,row.month,row.distributor===null?null:[row.distributor],row.branch===null?null:[row.branch]);
  for(const field of ['totalRequests','uniqueClients','repeatClients','missingIdentityRequests']) assert.equal(row[field],direct[field]);
}
const {clientMetrics,...rest}=output;assert.deepEqual(rest,baseline);
const html=summaryView(output,{month:'2026-10'});
assert(html.includes('<b>1.80</b>'));assert(html.includes('Clientes con más de una solicitud: 3.'));
assert(html.includes('Total de solicitudes consideradas: 9.'));
const nov=summaryView(output,{month:'2026-11'});assert(nov.includes('No disponible'));
// SHA inválido: cliente omitido y respuesta original íntegra.
const hash=manifest.archivos.GT_clientes_unicos.sha256;
manifest.archivos.GT_clientes_unicos.sha256='0'.repeat(64);
assert.deepEqual(JSON.parse(JSON.stringify(context.construirSalidaPublicaMxkConClientes_())),baseline);
manifest.archivos.GT_clientes_unicos.sha256=hash;
lockAvailable=false;assert.deepEqual(JSON.parse(JSON.stringify(context.construirSalidaPublicaMxkConClientes_())),baseline);lockAvailable=true;
for(const mutate of [r=>r[1][5]='2027-01-01T12:00:00-06:00',r=>r[0][0]='doc_ident',r=>r.push(r[1]),
  r=>{const i=r.findIndex(x=>x[2]==='identified');r[i][4]='[{"doc_ident":"private"}]';}]){
  const bad=structuredClone(rows);mutate(bad);assert.throws(()=>context.mxkValidarCohortes_(bad,updatedAt));
}
const nextDay=context.mxkLeerMetricasClientes_('2026-11-03T12:01:00-06:00',baseline);
assert(nextDay.rows.every(r=>r.month!=='2026-11'));assert(nextDay.rows.some(r=>r.month==='2026-10'));
// Public_API propuesto conserva todo el cálculo base; solo cambia el envoltorio doGet.
new vm.Script(fs.readFileSync(new URL('Public_API.gs',import.meta.url),'utf8'));
console.log('Apps Script local: filtros, 3/6/2.00, faltantes, SHA, corte, compatibilidad API y vista: PASS');
