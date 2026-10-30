import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('real October aggregates: monthly cards and projection match every distributor/branch filter; budget stays general',{skip:!process.env.MX_LIVE_SNAPSHOT},async()=>{
  const data=JSON.parse(fs.readFileSync(process.env.MX_LIVE_SNAPSHOT,'utf8'));
  const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'http://localhost:3000',runScripts:'outside-only'}),w=dom.window;
  w.setInterval=()=>0;w.fetch=async()=>({ok:true,json:async()=>data});
  try{
    w.eval(fs.readFileSync('public/dashboard.js','utf8'));await new Promise(r=>setTimeout(r,0));
    w.document.getElementById('month').value='2026-10';
    w.document.querySelector('[data-id="dispersals"]').click();
    const october=data.dispersions.filter(r=>r.date.startsWith('2026-10'));
    const combinations=[['',''],...Array.from(new Set(october.map(r=>r.distributor))).map(d=>[d,'']),...Array.from(new Set(october.map(r=>JSON.stringify([r.distributor,r.branch])))).map(x=>JSON.parse(x))];
    const today=data.updatedAt.slice(0,10),month='2026-10',days=31;
    const elapsed=month<today.slice(0,7)?days:month===today.slice(0,7)?Number(today.slice(8,10)):0;
    const number=s=>Number(s.replace(/,/g,''));
    for(const [distributor,branch]of combinations){
      w.document.getElementById('distributor').value=distributor;w.refreshBranches();w.document.getElementById('branch').value=branch;w.document.getElementById('apply').click();
      const rows=october.filter(r=>(!distributor||r.distributor===distributor)&&(!branch||r.branch===branch));
      const sales=rows.reduce((n,r)=>n+r.amount,0),credits=rows.reduce((n,r)=>n+r.credits,0);
      const cards=[...w.document.querySelectorAll('.card div')].map(x=>x.textContent);
      assert.equal(number(cards[0]),Math.round(sales),distributor+'/'+branch+' sales');
      assert.equal(number(cards[1]),credits,distributor+'/'+branch+' credits');
      assert.equal(number(cards[2]),Math.round(data.monthlyTargets[month]));
      assert.equal(w.document.querySelectorAll('.card h2')[2].textContent,'Meta general');
      const base=rows.filter(r=>r.date<=today).reduce((n,r)=>n+r.amount,0);
      assert.equal(cards[3],elapsed?new Intl.NumberFormat('es-GT').format(Math.round(base/elapsed*days)):'—');
    }
    // Branch alone is also an actual filter, not merely its distributor.
    w.document.getElementById('distributor').value='';w.refreshBranches();
    const branch=october[0].branch;w.document.getElementById('branch').value=branch;w.document.getElementById('apply').click();
    assert.equal(number(w.document.querySelector('.card div').textContent),Math.round(october.filter(r=>r.branch===branch).reduce((n,r)=>n+r.amount,0)));
    w.document.querySelector('[data-id="requests"]').click();
    assert.equal(number(w.document.querySelector('.card div').textContent),data.historicalTotals.requests.total);
  }finally{dom.window.close();}
});
