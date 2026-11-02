// Propuesta de lógica para adaptar a Apps Script DESPUÉS de autorización.
// No se importa desde la aplicación ni lee/escribe fuentes externas.
export function buildClientCounts(events, {updatedAt, completeMonths, basis}) {
  if (basis !== 'request-history') throw new Error('Se requiere historial de solicitudes, no último flujo por cliente');
  if (!Array.isArray(completeMonths) || new Set(completeMonths).size !== completeMonths.length ||
      !completeMonths.every(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= updatedAt.slice(0, 7))) {
    throw new Error('Debe verificarse la cobertura de cada mes');
  }
  const uniqueEvents = new Map();
  for (const event of events) {
    if (!event || !['requestId', 'date', 'distributor', 'branch'].every(k => typeof event[k] === 'string' && event[k].trim()) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || typeof event.doc_ident !== 'string') {
      throw new Error('Solicitud sin identidad de evento o dimensiones verificadas');
    }
    // Solo trim: preservar ceros iniciales; no fusionar documentos por reglas no confirmadas.
    const normalized = {requestId: event.requestId, date: event.date,
      distributor: event.distributor, branch: event.branch, doc_ident: event.doc_ident.trim()};
    const previous = uniqueEvents.get(event.requestId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(normalized)) {
      throw new Error('Un mismo identificador de solicitud tiene valores contradictorios');
    }
    uniqueEvents.set(event.requestId, normalized);
  }
  const pairs = new Map();
  const include = (distributor, branch) => pairs.set(JSON.stringify([distributor, branch]), [distributor, branch]);
  include(null, null);
  for (const event of uniqueEvents.values()) {
    include(event.distributor, null); include(null, event.branch); include(event.distributor, event.branch);
  }
  const rows = [];
  for (const month of completeMonths) {
    const monthEnd = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).toISOString().slice(0, 10);
    const periodEnd = monthEnd < updatedAt.slice(0, 10) ? monthEnd : updatedAt.slice(0, 10);
    const monthEvents = [...uniqueEvents.values()].filter(e => e.date.slice(0, 7) === month && e.date <= periodEnd);
    for (const [distributor, branch] of pairs.values()) {
      const selected = monthEvents.filter(e => (distributor === null || e.distributor === distributor) &&
        (branch === null || e.branch === branch));
      // El Set se calcula sobre TODO el conjunto filtrado: nunca sumar únicos por día/sucursal.
      rows.push({month, periodEnd, distributor, branch, totalRequests: selected.length,
        uniqueClients: new Set(selected.filter(e => e.doc_ident).map(e => e.doc_ident)).size,
        missingIdentityRequests: selected.filter(e => !e.doc_ident).length});
    }
  }
  return {basis, updatedAt, rows};
}
