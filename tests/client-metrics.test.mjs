import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildClientCounts} from '../proposals/client-counts.mjs';
import {validateClientMetrics, clientMetrics} from '../public/client-metrics.mjs';
import {summaryView} from '../public/summary-view.mjs';
const updatedAt = '2026-11-02T12:00:00-06:00';
// Identificadores ficticios exclusivamente para probar la deduplicación; no se publican.
const event = (requestId, doc_ident, branch = 'X', distributor = 'A', date = '2026-10-10') =>
  ({requestId, doc_ident, branch, distributor, date});
const events = [event('r1', 'customer-a'), event('r2', 'customer-a', 'Y'),
  event('r3', 'customer-a', 'X', 'B'), event('r4', 'customer-b', 'X'),
  event('r5', 'customer-a', 'X', 'A', '2026-11-01')];
const build = (rows = events) => buildClientCounts(rows, {updatedAt, completeMonths: ['2026-10', '2026-11'], basis: 'request-history'});
test('request history: three applications by one client remain three; deduplicate joins by request ID', () => {
  const data = {updatedAt, clientMetrics: build([events[0], events[1], events[2], events[0]])};
  const m = clientMetrics(data, {month: '2026-10'}, '2026-10-31');
  assert.equal(m.consideredRequests, 3); assert.equal(m.uniqueClients, 1); assert.equal(m.requestsPerClient, 3);
  const json = JSON.stringify(data.clientMetrics);
  for (const value of ['customer-a', 'r1', 'doc_ident', 'requestId']) assert(!json.includes(value));
  assert.throws(() => build([events[0], {...events[0], branch: 'Y'}]));
  assert.throws(() => buildClientCounts(events, {updatedAt, completeMonths: ['2026-10'], basis: 'latest-client-flow'}));
});
test('all months, distributor, branch and pair filters match independent sets without summing distincts', () => {
  const data = {updatedAt, clientMetrics: build()};
  validateClientMetrics(data.clientMetrics, updatedAt);
  for (const row of data.clientMetrics.rows) {
    const selected = events.filter(e => e.date.slice(0, 7) === row.month &&
      (row.distributor === null || e.distributor === row.distributor) && (row.branch === null || e.branch === row.branch));
    const result = clientMetrics(data, {month: row.month, distributor: row.distributor || '', branch: row.branch || ''}, row.periodEnd);
    assert.equal(result.consideredRequests, selected.length);
    assert.equal(result.uniqueClients, new Set(selected.map(e => e.doc_ident)).size);
    assert.equal(result.requestsPerClient, selected.length ? selected.length / result.uniqueClients : null);
  }
  assert.equal(clientMetrics(data, {month: '2026-10'}, '2026-10-31').uniqueClients, 2);
});
test('missing identifiers, missing periods, stale snapshots and forbidden fields fail without inventing clients', () => {
  const data = {updatedAt, clientMetrics: build([...events, event('r6', '')])};
  const m = clientMetrics(data, {month: '2026-10'}, '2026-10-31');
  assert.equal(m.consideredRequests, 5); assert.equal(m.uniqueClients, 2); assert.equal(m.requestsPerClient, 2);
  assert.equal(m.identifiedRequests, 4); assert.equal(m.identityCoverage, 80);
  assert.equal(clientMetrics(data, {month: '2026-09'}, '2026-09-30').consideredRequests, null);
  for (const mutate of [d => d.basis = 'latest-client-flow', d => d.updatedAt = '2026-10-01',
    d => d.rows[0].doc_ident = 'private', d => d.rows[0].uniqueClients = 999,
    d => d.rows.push(d.rows[0]), d => d.rows[0].totalRequests = 1.5]) {
    const invalid = build(); mutate(invalid); assert.throws(() => validateClientMetrics(invalid, updatedAt));
  }
});
test('view uses the exact history denominator and formats average with two decimals; no inferred fallback', () => {
  const data = {updatedAt, requests: [], dispersions: [], clientMetrics: build()};
  const html = summaryView(data, {month: '2026-10'});
  assert.match(html, /<strong>2<\/strong>/);
  assert.match(html, /<b>2.00<\/b>/);
  assert.match(html, /Total de solicitudes consideradas: 4/);
  delete data.clientMetrics;
  assert.match(summaryView(data, {month: '2026-10'}), /No disponible/);
  assert.match(summaryView(data, {month: '2026-10'}), /Registros en vista actual: 0/);
});

test('identified aggregates: denominator, recurrence, coverage and exact filters', () => {
  // Fixture exclusiva de pruebas; nunca se sirve al dashboard ni se presenta como dato real.
  const row = {month:'2026-10',periodEnd:'2026-10-31',distributor:null,branch:null,
    totalRequests:12,identifiedRequests:9,uniqueClients:4,repeatClients:3,
    missingIdentityRequests:3,contradictionRequests:1,recoveredRequests:2};
  const data = {updatedAt,requests:[],dispersions:[],clientMetrics:{basis:'request-history',updatedAt,
    snapshotAt:'2026-11-02T12:52:08-06:00',rows:[row]}};
  // El corte de lectura debe ser posterior al corte del historial.
  data.updatedAt = data.clientMetrics.updatedAt = '2026-11-02T13:00:00-06:00';
  const m = clientMetrics(data,{month:'2026-10'},'2026-10-31');
  assert.equal(m.uniqueClients,4); assert.equal(m.repeatClients,3);
  assert.equal(m.requestsPerClient.toFixed(2),'2.25');
  assert.equal(m.identityCoverage.toFixed(2),'75.00');
  assert.equal(m.identifiedRequests + m.missingIdentityRequests,m.consideredRequests);
  const html = summaryView(data,{month:'2026-10'});
  assert.match(html,/Recurrentes identificados: 3/);
  assert.match(html,/Cobertura: 75.00%/);
  assert.match(html,/Clientes únicos identificados/);
  for (const filters of [{month:'2026-11'},{month:'2026-10',distributor:'D1'},{month:'2026-10',branch:'X'}]) {
    assert.equal(clientMetrics(data,filters,filters.month==='2026-10'?'2026-10-31':'2026-11-02').uniqueClients,null);
  }
  for (const mutate of [r=>r.identifiedRequests++,r=>r.repeatClients=3000,r=>r.contradictionRequests=1200,
    r=>r.recoveredRequests=4000,r=>r.doc_ident='private']) {
    const bad=structuredClone(data.clientMetrics);mutate(bad.rows[0]);
    assert.throws(()=>validateClientMetrics(bad,data.updatedAt));
  }
});
