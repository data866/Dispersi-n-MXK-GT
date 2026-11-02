// PROPUESTA COMPLETA. Añadir solo DESPUÉS de autorización; no instalar activadores.
// No escribe hojas ni modifica Código.gs/API_Vercel.gs. Mismo proyecto y carpeta.
const MXK_CLIENTES = {habilitado: false, maxBytes: 10000000, maxFilas: 100000};

function mxkClavesExactas_(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
}
function mxkEntero_(value) {
  if (!/^\d+$/.test(String(value))) throw new Error('Conteo inválido');
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error('Conteo fuera de rango');
  return n;
}
function mxkDimension_(value) {
  if (typeof value !== 'string' || !value || value.length > 200 || /@|\b\d{10,}\b/.test(value)) {
    throw new Error('Dimensión inválida');
  }
  return value;
}
function mxkValidarCohortes_(filas, updatedAt) {
  const encabezados = ['month','periodEnd','kind','clientCount','requestsByDimension','snapshotAt'];
  if (!Array.isArray(filas) || filas.length < 2 || filas.length > MXK_CLIENTES.maxFilas + 1 ||
      JSON.stringify(filas[0]) !== JSON.stringify(encabezados)) throw new Error('CSV de clientes inválido');
  const cohortes = [], coverage = new Map(), seen = new Map();
  let snapshotAt = '';
  for (const fila of filas.slice(1)) {
    if (fila.length !== 6) throw new Error('Columnas de clientes inválidas');
    const [month, periodEnd, kind, clientCount, json, snapshot] = fila;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-06:00$/.test(snapshot) ||
        !Number.isFinite(Date.parse(snapshot)) || Date.parse(snapshot) > Date.parse(updatedAt) ||
        !['identified','missing','ambiguous','coverage'].includes(kind)) throw new Error('Corte o tipo inválido');
    if (snapshotAt && snapshotAt !== snapshot) throw new Error('Cortes mezclados');
    snapshotAt = snapshot;
    const monthEnd = new Date(Date.UTC(+month.slice(0,4), +month.slice(5), 0)).toISOString().slice(0,10);
    const expected = monthEnd < snapshot.slice(0,10) ? monthEnd : snapshot.slice(0,10);
    if (periodEnd !== expected || periodEnd.slice(0,7) !== month) throw new Error('Periodo inválido');
    const clients = mxkEntero_(clientCount), members = JSON.parse(json);
    if (!Array.isArray(members) || members.length > MXK_CLIENTES.maxFilas) throw new Error('Membresía inválida');
    const pairs = new Set();
    for (const member of members) {
      if (!mxkClavesExactas_(member, ['distributor','branch','requests'])) throw new Error('Campo no permitido');
      mxkDimension_(member.distributor); mxkDimension_(member.branch);
      if (!Number.isSafeInteger(member.requests) || member.requests <= 0) throw new Error('Cantidad inválida');
      const pair = JSON.stringify([member.distributor, member.branch]);
      if (pairs.has(pair)) throw new Error('Dimensión repetida');
      pairs.add(pair);
    }
    if (kind === 'coverage') {
      if (clients !== 0 || members.length || coverage.has(month)) throw new Error('Cobertura inválida');
      coverage.set(month, periodEnd);
    } else {
      if (!members.length || (kind === 'identified' ? clients < 1 : clients !== 0)) throw new Error('Cohorte inválida');
      const canonical = JSON.stringify(members.slice().sort((a,b) =>
        JSON.stringify([a.distributor,a.branch]).localeCompare(JSON.stringify([b.distributor,b.branch]))));
      const key = JSON.stringify([month, kind, canonical]);
      if (seen.has(key)) {
        if (kind !== 'identified') throw new Error('Cohorte de incidencias duplicada');
        const previous = seen.get(key);
        previous.clients += clients;
        if (!Number.isSafeInteger(previous.clients)) throw new Error('Conteo fuera de rango');
        continue;
      }
      const cohort = {month, periodEnd, kind, clients, members};
      seen.set(key,cohort);
      cohortes.push(cohort);
      continue;
    }
    cohortes.push({month, periodEnd, kind, clients, members});
  }
  if (!coverage.size || cohortes.some(c => !coverage.has(c.month))) throw new Error('Falta cobertura');
  return {cohortes, coverage, snapshotAt};
}

// También admite subconjuntos arbitrarios, sin sumar únicos de sucursales.
// null = todas; [] = ninguna; una lista = unión de esas opciones.
function calcularClientesParaFiltros_(cohortes, month, distributors, branches) {
  const marker = cohortes.find(c => c.month === month && c.kind === 'coverage');
  if (!marker) return null;
  const ds = distributors == null ? null : new Set(distributors);
  const bs = branches == null ? null : new Set(branches);
  const result = {totalRequests:0, uniqueClients:0, missingIdentityRequests:0, repeatClients:0};
  for (const c of cohortes) {
    if (c.month !== month || c.kind === 'coverage') continue;
    const quantity = c.members.reduce((n,m) => n +
      ((!ds || ds.has(m.distributor)) && (!bs || bs.has(m.branch)) ? m.requests : 0), 0);
    if (!quantity) continue;
    if (c.kind === 'identified') {
      result.totalRequests += quantity * c.clients;
      result.uniqueClients += c.clients;
      if (quantity > 1) result.repeatClients += c.clients;
    } else {
      result.totalRequests += quantity;
      result.missingIdentityRequests += quantity;
    }
  }
  if (!Object.values(result).every(Number.isSafeInteger)) throw new Error('Suma fuera de rango');
  return result;
}

// Precalcular las cuatro clases de filtro actuales en una sola pasada.
// Cada cohorte aporta UN cliente por combinación, aunque cruce sucursales.
function mxkConteosVistasActuales_(cohortes) {
  const totals = new Map();
  for (const c of cohortes) {
    if (c.kind === 'coverage') continue;
    const quantities = new Map();
    const add = (d,b,q) => {
      const key = JSON.stringify([c.month,d,b]);
      quantities.set(key,(quantities.get(key)||0)+q);
    };
    for (const m of c.members) {
      add(null,null,m.requests); add(m.distributor,null,m.requests);
      add(null,m.branch,m.requests); add(m.distributor,m.branch,m.requests);
    }
    for (const [key,quantity] of quantities) {
      if (!totals.has(key)) totals.set(key,{totalRequests:0,uniqueClients:0,missingIdentityRequests:0,repeatClients:0});
      const result = totals.get(key);
      if (c.kind === 'identified') {
        result.totalRequests += quantity*c.clients;
        result.uniqueClients += c.clients;
        if (quantity>1) result.repeatClients += c.clients;
      } else {
        result.totalRequests += quantity; result.missingIdentityRequests += quantity;
      }
      if (!Object.values(result).every(Number.isSafeInteger)) throw new Error('Suma fuera de rango');
    }
  }
  return totals;
}

function mxkLeerMetricasClientes_(updatedAt, salida) {
  const libro = SpreadsheetApp.openById(DASH_SYNC.libroId), control = libro.getSheetByName('CONTROL');
  if (!control || control.getLastRow() < 2) return null;
  const last = control.getRange(control.getLastRow(),1,1,5).getValues()[0];
  if (last[1] !== 'PUBLICADO') return null;
  const match = String(last[4]).match(/\bRUN_ID=(\d{8}T\d{6}Z_[a-f0-9]{8})\b/);
  if (!match) throw new Error('Publicación sin run_id');
  const runId = match[1], carpeta = DriveApp.getFolderById(DASH_SYNC.carpetaId);
  const manifest = JSON.parse(syncArchivoUnico_(carpeta,'MANIFIESTO_'+runId+'.json').getBlob().getDataAsString('UTF-8'));
  if (manifest.version !== 1 || manifest.run_id !== runId || !manifest.archivos) throw new Error('Manifiesto inválido');
  const info = manifest.archivos.GT_clientes_unicos;
  if (!info) return null; // Compatible con ejecuciones anteriores, sin tercer CSV.
  if (manifest.archivos.GT_solicitudes.registros !== salida.historicalTotals.requests.total ||
      manifest.archivos.GT_ofertas.registros !== salida.offers.reduce((n,r) => n+r.total,0)) {
    throw new Error('Las tablas visibles no corresponden al mismo manifiesto');
  }
  if (info.archivo !== 'GT_clientes_unicos_'+runId+'.csv' || info.columnas !== 6 ||
      !Number.isSafeInteger(info.registros) || info.registros < 1 || info.registros > MXK_CLIENTES.maxFilas ||
      !/^[a-f0-9]{64}$/.test(info.sha256)) throw new Error('Metadatos de clientes inválidos');
  const file = syncArchivoUnico_(carpeta,info.archivo);
  if (file.getSize() > MXK_CLIENTES.maxBytes) throw new Error('CSV excede límite de lectura');
  const blob = file.getBlob();
  if (syncSha256_(blob.getBytes()) !== info.sha256) throw new Error('SHA-256 de clientes no coincide');
  const filas = Utilities.parseCsv(blob.getDataAsString('UTF-8').replace(/^\uFEFF/,''));
  if (filas.length - 1 !== info.registros) throw new Error('Filas de clientes no coinciden');
  const parsed = mxkValidarCohortes_(filas,updatedAt), pairs = new Map();
  const add = (d,b) => pairs.set(JSON.stringify([d,b]),[d,b]);
  add(null,null);
  for (const c of parsed.cohortes) for (const m of c.members) {
    add(m.distributor,null); add(null,m.branch); add(m.distributor,m.branch);
  }
  for (const m of [...salida.requests,...salida.offers]) {
    add(m.distributor,null); add(null,m.branch); add(m.distributor,m.branch);
  }
  const rows = [], totals = mxkConteosVistasActuales_(parsed.cohortes);
  for (const [month,periodEnd] of parsed.coverage) {
    const monthEnd = new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10);
    const expected = monthEnd < updatedAt.slice(0,10) ? monthEnd : updatedAt.slice(0,10);
    // Tras medianoche no atribuir a hoy una extracción que solo cubre ayer.
    if (periodEnd !== expected) continue;
    for (const [distributor,branch] of pairs.values()) {
      rows.push({month,periodEnd,distributor,branch,...(totals.get(JSON.stringify([month,distributor,branch])) ||
        {totalRequests:0,uniqueClients:0,missingIdentityRequests:0,repeatClients:0})});
    }
  }
  if (rows.length > MXK_CLIENTES.maxFilas) throw new Error('Demasiadas combinaciones');
  return {basis:'request-history',updatedAt,snapshotAt:parsed.snapshotAt,rows};
}

function construirSalidaPublicaMxkConClientes_() {
  if (!MXK_CLIENTES.habilitado) return construirSalidaPublicaMxk_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return construirSalidaPublicaMxk_();
  try {
    const salida = construirSalidaPublicaMxk_();
    try {
      const metrics = mxkLeerMetricasClientes_(salida.updatedAt,salida);
      if (metrics) salida.clientMetrics = metrics;
    } catch (error) {
      // Un fallo del tercer CSV no interrumpe las cuatro vistas originales.
      console.warn('Conteos de clientes no publicados: validación pendiente.');
    }
    return salida;
  } finally {lock.releaseLock();}
}
