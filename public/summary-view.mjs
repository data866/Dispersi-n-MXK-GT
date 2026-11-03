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
  const items=m.months.filter(x=>!x.future);
  const max=Math.max(1,...items.map(x=>x.total||0));
  const scale=Math.ceil(max/5)*5;
  const width=900, left=48, right=20, base=258, top=60;
  const step=(width-left-right)/12;
  const y=v=>base-(v/scale)*(base-top);
  const labels=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const bars=m.months.map((item,i)=>{
    const x=left+step*(i+.5), value=item.total;
    if(value===null)return `<text x="${x}" y="278" text-anchor="middle">${labels[i]}</text>`;
    const h=base-y(value);
    const sign=item.delta===null?'':item.delta>0?'▲':item.delta<0?'▼':'=';
    const change=item.delta===null?'':item.changePct===null?sign:sign+Math.abs(item.changePct).toFixed(1)+'%';
    const color=item.delta>0?'#188a55':item.delta<0?'#d74452':'#778397';
    const tooltip=`${labels[i]} ${item.month.slice(0,4)}: ${n(value)} solicitudes totales; ${n(item.approved)} aprobadas${item.partial?' (mes parcial)':''}${item.delta===null?'':'; variación '+(item.delta>0?'+':'')+n(item.delta)+' ('+(item.changePct===null?'sin base':item.changePct.toFixed(1)+'%')+')'}`;
    return `<g><title>${tooltip}</title><rect x="${x-20}" y="${y(value)}" width="40" height="${h}" rx="5" fill="#0047bb" opacity="${item.partial?'.55':'1'}"/><text x="${x}" y="${Math.max(45,y(value)-8)}" text-anchor="middle" class="sg-bar-label">${n(value)}</text>${change?`<text x="${x}" y="28" text-anchor="middle" style="fill:${color};font-size:13px;font-weight:bold">${change}</text>`:''}<text x="${x}" y="278" text-anchor="middle">${labels[i]}${item.partial?'*':''}</text></g>`;
  }).join('');
  const points=items.map((item,i)=>`${left+step*(i+.5)},${y(item.approved)}`).join(' ');
  return `<svg class="sg-evolution" viewBox="0 0 900 290" role="img" aria-label="Barras de solicitudes totales y línea de solicitudes aprobadas por mes"><title>Evolución mensual de solicitudes totales y aprobadas</title>${Array.from({length:6},(_,i)=>`<line x1="${left}" x2="880" y1="${top+(base-top)*i/5}" y2="${top+(base-top)*i/5}" stroke="#e9edf4"/><text x="42" y="${top+6+(base-top)*i/5}" text-anchor="end">${n(Math.round(scale*(5-i)/5))}</text>`).join('')}${bars}<polyline points="${points}" fill="none" stroke="#cee600" stroke-width="4" stroke-linejoin="round"/>${items.map((item,i)=>`<circle cx="${left+step*(i+.5)}" cy="${y(item.approved)}" r="4" fill="#cee600"/>`).join('')}</svg><p class="sg-note">▲ Aumentó · ▼ Disminuyó · = Sin cambio frente al mes anterior. * Mes en curso, parcial y sin comparación contra un mes completo. Pasa el cursor sobre una barra para ver el detalle.</p>`;
}
export function summaryView(data, filters) {
  const m = summaryMetrics(data, filters);
  return `<div class="summary-general"><div class="sg-cards">${card('Total Solicitudes',n(m.total))}${card('Total Aprobadas',n(m.approved))}${card('Total Rechazadas',n(m.rejected))}${card('Sin concluir',n(m.unfinished))}${card('% Aprobado',p(m.approvalRate))}${card('% No Aprobado',p(m.nonApprovalRate))}</div><div class="sg-charts">${panel('Distribución de Solicitudes',donut(m))}${panel('Evolución de Solicitudes (Mensual)',`<div class="sg-chart-key"><span>■ Solicitudes</span><span>● Solicitudes aprobadas</span></div>${evolution(m)}`)}</div><div class="sg-bottom">${panel('Activación y Dispersión',`<div class="sg-activation"><div class="sg-icon" aria-hidden="true"><svg viewBox="0 0 90 70" width="70" height="65" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><circle cx="20" cy="49" r="15"/><circle cx="70" cy="49" r="15"/><path d="M20 49 36 26h20l14 23M20 49h29L36 26M49 49l10-33h-9M55 9h12l5 11M24 23h19"/></svg></div><div><h3>Créditos activados</h3><strong>${n(m.activations)}</strong></div><div class="sg-coins" aria-hidden="true"><svg viewBox="0 0 75 70" width="64" height="65" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><ellipse cx="45" cy="13" rx="23" ry="10"/><path d="M22 13v10c0 14 46 14 46 0V13M68 25v10c0 6-11 10-22 10"/><ellipse cx="26" cy="38" rx="23" ry="10"/><path d="M3 38v10c0 14 46 14 46 0V38M3 48v10c0 14 46 14 46 0V48"/></svg></div><div><h3>Monto dispersado</h3><strong>Q${n(Math.round(m.amount))}</strong></div></div>`)}${panel('Solicitudes Únicas por Cliente',`<div class="sg-clients"><div><h3>Clientes únicos identificados</h3><strong>${m.uniqueClients == null ? 'No disponible' : n(m.uniqueClients)}</strong></div><div><h3>Promedio entre clientes identificados</h3><b>${m.requestsPerClient == null ? (m.uniqueClients === 0 ? '—' : 'No disponible') : m.requestsPerClient.toFixed(2)}</b></div></div><p class="sg-note">${m.consideredRequests == null ? `Registros en vista actual: ${n(m.total)}. ` : `Total de solicitudes consideradas: ${n(m.consideredRequests)}. `}${m.consideredRequests == null ? '' : `Identificadas: ${n(m.identifiedRequests)} · Sin identidad: ${n(m.missingIdentityRequests)} · Cobertura: ${m.identityCoverage == null ? '—' : m.identityCoverage.toFixed(2)+'%'} · Recurrentes identificados: ${m.repeatClients == null ? 'No disponible' : n(m.repeatClients)}. `}${m.clientMetricsReason}</p>`)}</div></div>`;
}
