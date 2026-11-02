import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {summaryMetrics} from '../public/summary-metrics.mjs';
import {summaryView} from '../public/summary-view.mjs';
import {validatePublic} from '../api/data.mjs';

test('current real snapshot: all filter combinations, chart totals, activations and existing Excel exports',
  {skip: !process.env.MX_CURRENT_SNAPSHOT}, async t => {
    const data = validatePublic(JSON.parse(fs.readFileSync(process.env.MX_CURRENT_SNAPSHOT, 'utf8')));
    let combinations = 0;
    const months = [...new Set(data.requests.map(r => r.date.slice(0, 7)))];
    const dimensions = new Map([[JSON.stringify(['', '']), ['', '']]]);
    for (const row of [...data.requests, ...data.dispersions]) {
      for (const pair of [[row.distributor, ''], ['', row.branch], [row.distributor, row.branch]]) {
        dimensions.set(JSON.stringify(pair), pair);
      }
    }
    for (const month of months) for (const [distributor, branch] of dimensions.values()) {
      const result = summaryMetrics(data, {month, distributor, branch});
      const match = r => r.date >= result.period.start && r.date <= result.period.end &&
        (!distributor || r.distributor === distributor) && (!branch || r.branch === branch);
      const requests = data.requests.filter(match), dispersions = data.dispersions.filter(match);
      const total = requests.reduce((s, r) => s + r.total, 0);
      assert.equal(result.total, total);
      assert.equal(result.approved + result.rejected + result.unfinished, total);
      assert.equal(result.distribution.reduce((s, r) => s + r.count, 0), total);
      assert.equal(result.weeks.length, 6);
      assert.equal(result.weeks.reduce((s, r) => s + (r.total ?? 0), 0), total);
      assert.equal(result.approvalRate, total ? result.approved / total * 100 : null);
      assert.equal(result.activations, dispersions.reduce((s, r) => s + r.credits, 0));
      assert.equal(result.amount, dispersions.reduce((s, r) => s + r.amount, 0));
      if (!data.clientMetrics) assert.equal(result.uniqueClients, null);
      combinations++;
    }
    const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), {url: 'http://localhost', runScripts: 'outside-only'});
    const w = dom.window;
    let exports = 0;
    try {
      w.summaryView = summaryView; w.setInterval = () => 0;
      w.fetch = async () => ({ok: true, json: async () => data});
      w.URL.createObjectURL = blob => (w.__export = blob, 'blob:export');
      w.URL.revokeObjectURL = () => {}; w.HTMLAnchorElement.prototype.click = function () {};
      w.eval(fs.readFileSync('public/dashboard.js', 'utf8'));
      await new Promise(resolve => setTimeout(resolve, 0));
      w.document.getElementById('month').value = '2026-10';
      for (const tab of ['requests', 'dispersals', 'inventory', 'detail']) {
        w.document.querySelector(`[data-id="${tab}"]`).click();
        assert(!w.document.querySelector('.summary-general'));
        const buttons = [...w.document.querySelectorAll('[data-export]')];
        assert(buttons.length > 0);
        for (const button of buttons) {
          button.click();
          const text = await w.__export.text();
          assert(text.startsWith('PK')); assert(text.includes('<worksheet'));
          assert(text.includes('<sheetData>')); exports++;
        }
        if (tab === 'detail') {
          const actualUser = data.requests.find(r => r.date.startsWith('2026-10') && r.user)?.user;
          if (actualUser) {
            assert(w.document.getElementById('view').textContent.includes(actualUser));
            buttons[0].click();
            const xmlName = actualUser.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            assert((await w.__export.text()).includes(xmlName));
          }
        }
      }
      w.document.querySelector('[data-id="summary"]').click();
      assert.equal(w.document.querySelectorAll('.sg-card').length, 6);
      assert.equal(w.document.querySelectorAll('.sg-charts svg').length, 2);
    } finally {w.close();}
    t.diagnostic(`${data.updatedAt}: ${combinations} real filter combinations; ${exports} existing XLSX exports. Client counts ${data.clientMetrics ? 'provided' : 'not provided by source'}.`);
  });
