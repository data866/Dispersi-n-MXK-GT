// Contrato de conteos agregados. Nunca admite identificadores de clientes.
export function validateClientMetrics(metrics, updatedAt) {
  const optionalKeys = (value, required, optional) => value && typeof value === 'object' && !Array.isArray(value) &&
    required.every(k => k in value) && Object.keys(value).every(k => required.includes(k) || optional.includes(k));
  if (!optionalKeys(metrics, ['basis', 'updatedAt', 'rows'], ['snapshotAt']) || metrics.basis !== 'request-history' ||
      metrics.updatedAt !== updatedAt || !Array.isArray(metrics.rows) || metrics.rows.length > 100000) {
    throw new Error('Conteos de clientes no verificables');
  }
  if (metrics.snapshotAt !== undefined && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-06:00$/.test(metrics.snapshotAt) ||
      !Number.isFinite(Date.parse(metrics.snapshotAt)) || Date.parse(metrics.snapshotAt) > Date.parse(updatedAt))) {
    throw new Error('Corte del historial inválido');
  }
  const seen = new Set();
  for (const row of metrics.rows) {
    if (!optionalKeys(row, ['month', 'periodEnd', 'distributor', 'branch', 'totalRequests', 'uniqueClients', 'missingIdentityRequests'],
        ['identifiedRequests', 'repeatClients', 'contradictionRequests', 'recoveredRequests']) ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.periodEnd) ||
        row.periodEnd.slice(0, 7) !== row.month || row.periodEnd > updatedAt.slice(0, 10) ||
        ![row.distributor, row.branch].every(v => v === null || (typeof v === 'string' && v.length > 0 && v.length <= 200 && !/@|\b\d{10,}\b/.test(v))) ||
        ![row.totalRequests, row.uniqueClients, row.missingIdentityRequests].every(v => Number.isSafeInteger(v) && v >= 0) ||
        row.missingIdentityRequests > row.totalRequests ||
        row.uniqueClients > row.totalRequests - row.missingIdentityRequests ||
        (row.totalRequests > row.missingIdentityRequests && row.uniqueClients === 0)) {
      throw new Error('Conteo de clientes inválido');
    }
    const identified = row.totalRequests - row.missingIdentityRequests;
    for (const field of ['identifiedRequests','repeatClients','contradictionRequests','recoveredRequests']) {
      if (row[field] !== undefined && (!Number.isSafeInteger(row[field]) || row[field] < 0)) throw new Error('Conteo identificado inválido');
    }
    if ((row.identifiedRequests !== undefined && row.identifiedRequests !== identified) ||
        (row.repeatClients !== undefined && (row.repeatClients > row.uniqueClients || identified < row.uniqueClients + row.repeatClients || (identified > row.uniqueClients && row.repeatClients === 0))) ||
        (row.contradictionRequests !== undefined && row.contradictionRequests > row.missingIdentityRequests) ||
        (row.recoveredRequests !== undefined && row.recoveredRequests > identified) ||
        (metrics.snapshotAt && row.periodEnd > metrics.snapshotAt.slice(0,10))) throw new Error('Historial identificado inconsistente');
    const key = JSON.stringify([row.month, row.distributor, row.branch]);
    const monthEnd = new Date(Date.UTC(+row.month.slice(0, 4), +row.month.slice(5), 0)).toISOString().slice(0, 10);
    const cutoff = updatedAt.slice(0, 10);
    if (row.periodEnd !== (monthEnd < cutoff ? monthEnd : cutoff)) throw new Error('Periodo de clientes incompleto');
    if (seen.has(key)) throw new Error('Conteo de clientes duplicado');
    seen.add(key);
  }
  return metrics;
}

export function clientMetrics(data, {month, distributor = '', branch = ''}, end) {
  if (!data.clientMetrics) return {uniqueClients: null, requestsPerClient: null, consideredRequests: null, identifiedRequests: null, repeatClients: null, identityCoverage: null, missingIdentityRequests: null,
    clientMetricsReason: 'Pendiente de datos reales de clientes identificados en la API.'};
  const metrics = validateClientMetrics(data.clientMetrics, data.updatedAt);
  const row = metrics.rows.find(r => r.month === month && r.periodEnd === end &&
    r.distributor === (distributor || null) && r.branch === (branch || null));
  if (!row) return {uniqueClients: null, requestsPerClient: null, consideredRequests: null, identifiedRequests: null, repeatClients: null, identityCoverage: null, missingIdentityRequests: null,
    clientMetricsReason: 'Falta el conteo del historial para este periodo y estos filtros.'};
  const identified = row.totalRequests - row.missingIdentityRequests;
  return {uniqueClients: row.uniqueClients,
    repeatClients: row.repeatClients ?? null,
    requestsPerClient: row.uniqueClients > 0 ? identified / row.uniqueClients : null,
    consideredRequests: row.totalRequests,
    identifiedRequests: identified,
    missingIdentityRequests: row.missingIdentityRequests,
    identityCoverage: row.totalRequests > 0 ? identified / row.totalRequests * 100 : null,
    contradictionRequests: row.contradictionRequests ?? null,
    clientMetricsReason: row.totalRequests === 0 ? 'Sin solicitudes en este conjunto.' : ''};
}
