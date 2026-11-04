import {summaryMetrics} from './summary-metrics.mjs';
const number = new Intl.NumberFormat('es-GT');
const n = value => number.format(value);
const p = value => value == null ? '—' : `${value.toFixed(1)}%`;
const colors = ['#0047bb', '#cee600', '#b4d5ff'];
const panel = (title, body, cls = '') => `<section class="sg-panel ${cls}"><h2>${title}</h2>${body}</section>`;
const card = (title, value) => `<article class="sg-card"><h2>${title}</h2><strong>${value}</strong></article>`;
function donut(m) {
  let offset = 0;
  const rings = m.distribution.map((item, i) => {
    const length = m.total ? item.count / m.total * 100 : 0;
    const ring = `<circle cx="150" cy="150" r="108" fill="none" stroke="${colors[i]}" stroke-width="76" pathLength="100" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 150 150)"/>`;
    offset += length;
    return ring;
  }).join('');
  let angle = -Math.PI / 2;
  const labels = m.distribution.map((item, i) => {
    const fraction = m.total ? item.count / m.total : 0;
    const mid = angle + fraction * Math.PI;
    angle += fraction * Math.PI * 2;
    return fraction >= .07 ? `<text x="${150+108*Math.cos(mid)}" y="${157+108*Math.sin(mid)}" fill="${i===0?'white':'#00358e'}">${p(item.percentage)}</text>` : '';
  }).join('');
  return `<div class="sg-distribution"><svg viewBox="0 0 300 300" role="img" aria-label="Distribución de solicitudes"><circle cx="150" cy="150" r="108" fill="none" stroke="#eef2f6" stroke-width="76"/>${rings}${labels}<text x="150" y="146" class="sg-donut-total">${n(m.total)}</text><text x="150" y="174" class="sg-donut-caption">Solicitudes</text></svg><ul>${m.distribution.map((item,i)=>`<li><i style="background:${colors[i]}"></i><span>${item.label}</span><b>${n(item.count)} (${p(item.percentage)})</b></li>`).join('')}</ul></div>`;
}
function evolution(m) {
  const max = Math.max(1, ...m.weeks.map(w=>w.total??0));
  const scale = Math.max(5, Math.ceil(max / 5)) * 5;
  const x = i => 115 + i * 107;
  const y = value => 235 - value / scale * 185;
  const points = m.weeks.map((w,i)=>w.approvalRate==null?null:`${x(i)},${235-w.approvalRate/100*185}`);
  const lines = [];
  for(let i=1;i<points.length;i++) if(points[i-1]&&points[i]) lines.push(`<polyline points="${points[i-1]} ${points[i]}" fill="none" stroke="#cee600" stroke-width="5"/>`);
  return `<svg class="sg-evolution" viewBox="0 0 780 285" role="img" aria-label="Solicitudes semanales y porcentaje aprobado"><title>Semanas calendario recortadas al mes seleccionado; asterisco indica semana parcial</title>${Array.from({length:6},(_,i)=>`<line x1="58" x2="720" y1="${50+i*37}" y2="${50+i*37}" stroke="#e9edf4"/><text x="48" y="${56+i*37}" text-anchor="end">${n(Math.round(scale*(5-i)/5))}</text><text x="731" y="${56+i*37}">${100-i*20}%</text>`).join('')}${m.weeks.map((w,i)=>`<rect x="${x(i)-44}" y="${y(w.total??0)}" width="88" height="${235-y(w.total??0)}" rx="8" fill="url(#sg-blue)"/><text x="${x(i)}" y="${Math.max(30,y(w.total??0)-10)}" text-anchor="middle" class="sg-bar-label">${w.total==null?'—':n(w.total)}</text><text x="${x(i)}" y="266" text-anchor="middle">${w.weekStart.slice(5)}${w.partial?'*':''}</text>`).join('')}${lines.join('')}${m.weeks.map((w,i)=>w.approvalRate==null?'':`<circle cx="${x(i)}" cy="${235-w.approvalRate/100*185}" r="7" fill="#cee600"/><text x="${x(i)}" y="${220-w.approvalRate/100*185}" text-anchor="middle" class="sg-rate">${p(w.approvalRate)}</text>`).join('')}<defs><linearGradient id="sg-blue" x2="0" y2="1"><stop stop-color="#0047bb"/><stop offset="1" stop-color="#00358e"/></linearGradient></defs></svg><p class="sg-note">Inicio de semana (lunes). * Semana parcial. — Fuera del mes o sin porcentaje calculable.</p>`;
}
export function summaryView(data, filters) {
  const m = summaryMetrics(data, filters);
  return `<div class="summary-general"><div class="sg-cards">${card('Total Solicitudes',n(m.total))}${card('Total Aprobadas',n(m.approved))}${card('Total Rechazadas',n(m.rejected))}${card('Sin concluir',n(m.unfinished))}${card('% Aprobado',p(m.approvalRate))}${card('% No Aprobado',p(m.nonApprovalRate))}</div><div class="sg-charts">${panel('Distribución de Solicitudes',donut(m))}${panel('Evolución de Solicitudes (Últimas 6 semanas)',`<div class="sg-chart-key"><span>■ Solicitudes</span><span>🟡 % Aprobado</span></div>${evolution(m)}`)}</div><div class="sg-bottom">${panel('Activación y Dispersión',`<div class="sg-activation"><div class="sg-icon" aria-hidden="true"><svg viewBox="0 0 90 70" width="70" height="65" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><circle cx="20" cy="49" r="15"/><circle cx="70" cy="49" r="15"/><path d="M20 49 36 26h20l14 23M20 49h29L36 26M49 49l10-33h-9M55 9h12l5 11M24 23h19"/></svg></div><div><h3>Créditos activados</h3><strong>${n(m.activations)}</strong></div><div class="sg-coins" aria-hidden="true"><svg viewBox="0 0 75 70" width="64" height="65" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><ellipse cx="45" cy="13" rx="23" ry="10"/><path d="M22 13v10c0 14 46 14 46 0V13M68 25v10c0 6-11 10-22 10"/><ellipse cx="26" cy="38" rx="23" ry="10"/><path d="M3 38v10c0 14 46 14 46 0V38M3 48v10c0 14 46 14 46 0V48"/></svg></div><div><h3>Monto dispersado</h3><strong>Q${n(Math.round(m.amount))}</strong></div></div>`)}${panel('Solicitudes Únicas por Cliente',`<div class="sg-clients"><div><h3>Clientes únicos</h3><strong>${m.uniqueClients == null ? 'No disponible' : n(m.uniqueClients)}</strong></div><div><h3>Promedio de solicitudes por cliente</h3><b>${m.requestsPerClient == null ? (m.uniqueClients === 0 ? '—' : 'No disponible') : m.requestsPerClient.toFixed(2)}</b></div></div><p class="sg-note">${m.consideredRequests == null ? `Registros en vista actual: ${n(m.total)}. ` : `Total de solicitudes consideradas: ${n(m.consideredRequests)}. `}${m.repeatClients == null ? '' : `Clientes con más de una solicitud: ${n(m.repeatClients)}. `}${m.clientMetricsReason}</p>`)}</div></div>`;
}
