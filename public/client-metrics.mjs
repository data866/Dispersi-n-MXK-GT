// Validación de agregados públicos: nunca recibe identificadores personales.
const obj = x => x && typeof x === 'object' && !Array.isArray(x);
const int = x => Number.isSafeInteger(x) && x >= 0;
const safe = x => typeof x === 'string' && x.length > 0 && x.length <= 200 && !/@|\b\d{10,}\b/.test(x);
const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x+'T00:00:00Z'));
const exactKeys = (x, required) => obj(x) && required.every(k => Object.hasOwn(x,k)) && Object.keys(x).every(k => required.includes(k));
const endOfMonth = m => new Date(Date.UTC(+m.slice(0,4),+m.slice(5),0)).toISOString().slice(0,10);
export function validateClientMetrics(metrics, updatedAt) {
  if (!exactKeys(metrics,['coverage','cohorts']) || !Array.isArray(metrics.coverage) || !Array.isArray(metrics.cohorts) || metrics.coverage.length > 1200 || metrics.cohorts.length > 100000 || typeof updatedAt !== 'string' || !date(updatedAt.slice(0,10))) throw Error('Conteos de clientes no verificables');
  const months=new Map();
  for(const c of metrics.coverage){
    if(!exactKeys(c,['month','periodEnd','snapshotAt']) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(c.month) || !date(c.periodEnd) || (c.periodEnd < c.month+'-01' || c.periodEnd > endOfMonth(c.month) || c.periodEnd > updatedAt.slice(0,10) || c.periodEnd > c.snapshotAt.slice(0,10)) || typeof c.snapshotAt !== 'string' || !Number.isFinite(Date.parse(c.snapshotAt)) || Date.parse(c.snapshotAt)>Date.parse(updatedAt) || months.has(c.month)) throw Error('Cobertura de clientes inválida');
    months.set(c.month,c.periodEnd);
  }
  for(const c of metrics.cohorts){
    if(!exactKeys(c,['month','periodEnd','kind','clientCount','cohortCount','requestsByDimension','snapshotAt']) || months.get(c.month)!==c.periodEnd || !['identified','ambiguous','missing'].includes(c.kind) || !int(c.clientCount) || !int(c.cohortCount) || c.cohortCount===0 || (c.kind==='identified' ? c.clientCount===0 || c.cohortCount>c.clientCount : c.clientCount!==0) || !Array.isArray(c.requestsByDimension) || c.requestsByDimension.length>10000 || typeof c.snapshotAt!=='string' || !Number.isFinite(Date.parse(c.snapshotAt)) || Date.parse(c.snapshotAt)>Date.parse(updatedAt)) throw Error('Cohorte de clientes inválida');
    const seen=new Set(); let count=0;
    for(const d of c.requestsByDimension){
      if(!exactKeys(d,['distributor','branch','requests']) || !safe(d.distributor) || !safe(d.branch) || !int(d.requests) || !d.requests) throw Error('Dimensión de clientes inválida');
      const k=JSON.stringify([d.distributor,d.branch]); if(seen.has(k)) throw Error('Dimensión duplicada'); seen.add(k); count+=d.requests;
    }
    if (c.kind === 'identified' && count < c.clientCount) {
  console.error('MAXIKASH COHORTE INCONSISTENTE', {
    month: c.month,
    periodEnd: c.periodEnd,
    clientCount: c.clientCount,
    cohortCount: c.cohortCount,
    requestsCount: count,
    dimensionsCount: c.requestsByDimension.length
  });

  throw Error('Conteo identificado inconsistente');
}
  }
  return metrics;
}
const empty = reason => ({uniqueClients:null,requestsPerClient:null,consideredRequests:null,identifiedRequests:null,repeatClients:null,identityCoverage:null,missingIdentityRequests:null,contradictionRequests:null,clientMetricsReason:reason});
export function clientMetrics(data,{month,distributor='',branch=''},end){
  if(!data.clientMetrics) return empty('Pendiente de datos reales de clientes identificados en la API.');
  const metrics=validateClientMetrics(data.clientMetrics,data.updatedAt);
  const coverage=metrics.coverage.find(c=>c.month===month && c.periodEnd<=end);
  if(!coverage) return empty('Sin cobertura del historial para este periodo.');
  const cutoff=coverage.periodEnd;
  let unique=0, identified=0, unknown=0, repeat=0, exact=true, repeatExact=true;
  for(const c of metrics.cohorts.filter(c=>c.month===month && c.periodEnd===cutoff)){
    const matching=c.requestsByDimension.filter(d=>(!distributor||d.distributor===distributor)&&(!branch||d.branch===branch));
    const requests=matching.reduce((n,d)=>n+d.requests,0);
    if(!requests) continue;
    if(c.kind!=='identified'){unknown+=requests;continue;}
    identified+=requests;
    if((!distributor&&!branch) || matching.length===c.requestsByDimension.length || c.clientCount===1) unique+=c.clientCount;
    else exact=false;
    if(c.clientCount===1){if(requests>1)repeat++;}else repeatExact=false;
  }
  const total=identified+unknown;
  return {uniqueClients:exact?unique:null,requestsPerClient:exact&&unique>0?identified/unique:null,consideredRequests:total,identifiedRequests:identified,repeatClients:repeatExact?repeat:null,identityCoverage:total>0?identified/total*100:null,missingIdentityRequests:unknown,contradictionRequests:null,clientMetricsReason:(cutoff<end?'Datos de clientes al '+cutoff+'; aún no incluyen el resto del periodo. ':'')+(!exact?'Clientes únicos no determinables exactamente con este filtro.':!repeatExact?'Clientes recurrentes no determinables exactamente en cohortes agrupadas.':'Solicitudes sin identidad incluyen casos ambiguos; los clientes se cuentan por mes.')};
}
