import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summaryMetrics} from '../public/summary-metrics.mjs';
import {summaryView} from '../public/summary-view.mjs';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

// Datos exclusivamente de prueba; no se sirven al dashboard.
const request = (date, distributor, branch, total, approved, rejected, unfinished) =>
  ({date, distributor, branch, total, approved, rejected, unfinished});
const data = {
  updatedAt: '2026-11-02T12:00:00-06:00',
  requests: [request('2026-10-01', 'A', 'X', 12, 6, 4, 2),
    request('2026-10-31', 'B', 'Y', 8, 2, 5, 1),
    request('2026-11-01', 'A', 'X', 3, 1, 1, 1)],
  dispersions: [{date: '2026-10-10', distributor: 'A', branch: 'X', credits: 2, amount: 100.25},
    {date: '2026-11-01', distributor: 'A', branch: 'X', credits: 1, amount: 50}]
};
test('weighted monthly totals, percentages and activation dates', () => {
  const m = summaryMetrics(data, {month: '2026-10'});
  assert.deepEqual([m.total, m.approved, m.rejected, m.unfinished], [20, 8, 9, 3]);
  assert.equal(m.approvalRate, 40);
  assert.equal(m.nonApprovalRate, 60);
  assert.equal(m.activations, 2);
  assert.equal(m.amount, 100.25);
  assert.equal(m.weeks.length, 6);
  assert.equal(m.weeks.reduce((n, w) => n + (w.total ?? 0), 0), m.total);
  assert.equal(m.weeks[0].applicable, false);
  assert.equal(m.weeks[0].total, null);
  assert.equal(m.weeks.at(-1).periodEnd, '2026-10-31');
  assert.equal(m.weeks.at(-1).partial, true);
  assert.equal(m.uniqueClients, null);
  assert.equal(m.requestsPerClient, null);
  assert.equal(m.previousWeekComparison, null);
});
test('distributor and branch filters, empty denominator, future month and cutoff', () => {
  assert.equal(summaryMetrics(data, {month: '2026-10', distributor: 'A'}).total, 12);
  assert.equal(summaryMetrics(data, {month: '2026-10', branch: 'Y'}).total, 8);
  const empty = summaryMetrics(data, {month: '2026-10', distributor: 'A', branch: 'Y'});
  assert.equal(empty.total, 0);
  assert.equal(empty.approvalRate, null);
  assert.equal(summaryMetrics(data, {month: '2026-12'}).total, 0);
  assert.equal(summaryMetrics(data, {month: '2026-11'}).period.end, '2026-11-02');
  assert.throws(() => summaryMetrics(data, {month: '2026-13'}));
});
test('fifth tab renders charts and responds to existing filters without changing original tabs', async () => {
  const snapshot = {...data, schemaVersion: 3, offers: [], monthlyTargets: {}, dailyTargets: {},
    historicalTotals: {requests: {total: 23, approved: 9, rejected: 10, unfinished: 4}}};
  const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), {url: 'http://localhost', runScripts: 'outside-only'});
  const w = dom.window;
  try {
    w.summaryView = summaryView;
    w.setInterval = () => 0;
    w.fetch = async () => ({ok: true, json: async () => snapshot});
    w.eval(fs.readFileSync('public/dashboard.js', 'utf8'));
    await new Promise(resolve => setTimeout(resolve, 0));
    w.document.getElementById('month').value = '2026-10';
    w.document.querySelector('[data-id="summary"]').click();
    assert.equal(w.document.querySelectorAll('.sg-card').length, 6);
    assert.equal(w.document.querySelector('.sg-card strong').textContent, '20');
    assert.equal(w.document.querySelectorAll('.sg-charts svg').length, 2);
    assert.match(w.document.querySelector('.sg-clients').textContent, /No disponible/);
    w.document.getElementById('distributor').value = 'A';
    w.document.getElementById('distributor').onchange();
    assert.equal(w.document.querySelector('.sg-card strong').textContent, '12');
    w.document.querySelector('[data-id="requests"]').click();
    assert.equal(w.document.querySelectorAll('.card').length, 5);
    assert.equal(w.document.querySelector('.summary-general'), null);
  } finally {w.close();}
});
