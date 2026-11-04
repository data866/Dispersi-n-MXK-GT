import {clientMetrics} from './client-metrics.mjs';
// Solo agregados existentes: nunca estima clientes a partir de nombres o grupos.
const sum = (rows, field) => rows.reduce((n, row) => n + row[field], 0);
const percent = (part, total) => total > 0 ? part / total * 100 : null;
const day = date => new Date(`${date}T00:00:00Z`);
const dateString = date => date.toISOString().slice(0, 10);
function monday(date) {
  const result = day(date);
  result.setUTCDate(result.getUTCDate() - (result.getUTCDay() + 6) % 7);
  return result;
}

export function summaryMetrics(data, {month, distributor = '', branch = ''}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes inválido');
  const cutoff = data.updatedAt.slice(0, 10);
  const monthEnd = dateString(new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)));
  const end = monthEnd < cutoff ? monthEnd : cutoff;
  const start = `${month}-01`;
  const selected = row => (!distributor || row.distributor === distributor) &&
    (!branch || row.branch === branch);
  const inPeriod = row => selected(row) && row.date >= start && row.date <= end;
  const rows = data.requests.filter(inPeriod);
  const dispersions = data.dispersions.filter(inPeriod);
  const total = sum(rows, 'total');
  const approved = sum(rows, 'approved');
  const rejected = sum(rows, 'rejected');
  const unfinished = sum(rows, 'unfinished');
  // Seis semanas calendario hasta el cierre/corte del mes. Se recortan al mes
  // seleccionado: no se mezclan solicitudes de otros meses con las tarjetas.
  const anchor = monday(end < start ? start : end);
  const weeks = Array.from({length: 6}, (_, index) => {
    const from = new Date(anchor);
    from.setUTCDate(from.getUTCDate() - (5 - index) * 7);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 6);
    const weekStart = dateString(from), weekEnd = dateString(to);
    const periodStart = weekStart < start ? start : weekStart;
    const periodEnd = weekEnd > end ? end : weekEnd;
    const applicable = periodStart <= periodEnd;
    const weekRows = applicable ? rows.filter(r => r.date >= periodStart && r.date <= periodEnd) : [];
    const count = sum(weekRows, 'total');
    return {weekStart, weekEnd, periodStart, periodEnd, applicable,
      partial: applicable && (periodStart !== weekStart || periodEnd !== weekEnd),
      total: applicable ? count : null,
      approvalRate: applicable ? percent(sum(weekRows, 'approved'), count) : null};
  });
  return {
    period: {start, end, cutoff},
    total, approved, rejected, unfinished,
    approvalRate: percent(approved, total),
    nonApprovalRate: percent(rejected + unfinished, total),
    distribution: [
      {label: 'Aprobadas', count: approved, percentage: percent(approved, total)},
      {label: 'Rechazadas', count: rejected, percentage: percent(rejected, total)},
      {label: 'Sin concluir', count: unfinished, percentage: percent(unfinished, total)}
    ],
    weeks,
    activations: sum(dispersions, 'credits'),
    amount: sum(dispersions, 'amount'),
    // La API no declara cobertura temporal; filas ausentes no certifican una
    // semana completa. No publicar comparativos hasta disponer de esa garantía.
    previousWeekComparison: null,
    ...clientMetrics(data, {month, distributor, branch}, end)
  };
}
