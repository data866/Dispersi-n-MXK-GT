// Contrato de conteos agregados. Nunca admite identificadores de clientes.
export function validateClientMetrics(metrics, updatedAt) {
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
  if (!exact(metrics, ['basis', 'updatedAt', 'rows']) || metrics.basis !== 'request-history' ||
      metrics.updatedAt !== updatedAt || !Array.isArray(metrics.rows) || metrics.rows.length > 100000) {
    throw new Error('Conteos de clientes no verificables');
  }
  const seen = new Set();
  for (const row of metrics.rows) {
    if (!exact(row, ['month', 'periodEnd', 'distributor', 'branch', 'totalRequests', 'uniqueClients', 'missingIdentityRequests']) ||
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
  if (!data.clientMetrics) return {uniqueClients: null, requestsPerClient: null, consideredRequests: null,
    clientMetricsReason: 'La fuente no entrega conteos verificables del historial de solicitudes.'};
  const metrics = validateClientMetrics(data.clientMetrics, data.updatedAt);
  const row = metrics.rows.find(r => r.month === month && r.periodEnd === end &&
    r.distributor === (distributor || null) && r.branch === (branch || null));
  if (!row) return {uniqueClients: null, requestsPerClient: null, consideredRequests: null,
    clientMetricsReason: 'Falta el conteo del historial para este periodo y estos filtros.'};
  const complete = row.missingIdentityRequests === 0;
  return {uniqueClients: complete ? row.uniqueClients : null,
    requestsPerClient: complete && row.uniqueClients > 0 ? row.totalRequests / row.uniqueClients : null,
    consideredRequests: row.totalRequests,
    clientMetricsReason: complete ? (row.uniqueClients === 0 ? 'Sin solicitudes en este conjunto.' : '') :
      `${row.missingIdentityRequests} solicitudes sin identificador; no se estima el número de clientes.`};
}
