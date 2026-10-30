import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createHash} from 'node:crypto';import {JSDOM} from 'jsdom';
import handler,{anonymizeUsers,validatePublic} from '../api/data.mjs';
function fixture(){return {schemaVersion:3,source:'Google Sheets / Apps Script',updatedAt:'2026-10-29T12:00:00-06:00',requests:[{date:'2026-10-10',week:'202641',distributor:'A',branch:'X',user:'Usuario 1',followup:'7 Completo',total:30,approved:10,rejected:18,unfinished:2},{date:'2026-10-11',week:'202641',distributor:'B',branch:'Y',user:'Usuario 2',followup:'5 Rechazado',total:30,approved:10,rejected:18,unfinished:2}],dispersions:[{date:'2026-10-10',distributor:'A',branch:'X',credits:2,amount:100,pagare:1.7,montoActivado:1,hasFactorData:true},{date:'2026-09-10',distributor:'B',branch:'Y',credits:3,amount:200,pagare:0,montoActivado:0,hasFactorData:false}],offers:[{month:'2026-10',distributor:'A',branch:'X',stage:'CUALQUIERA',brand:'Marca',model:'Modelo',total:3,activated:2,amount:100}],historicalTotals:{requests:{total:60,approved:20,rejected:36,unfinished:4},activations:5,sales:300},monthlyTargets:{'2026-10':850000},dailyTargets:{'2026-10-01':850000}};}
test('public schema rejects customer fields, arbitrary nested fields, email labels and inconsistent totals',()=>{
  assert.equal(validatePublic(fixture()).historicalTotals.activations,5);
  for(const mutate of [d=>d.requests[0].client='PRIVATE',d=>d.offers[0].id='PRIVATE',d=>d.secret='PRIVATE',d=>d.requests[0].branch='a@example.com',d=>d.historicalTotals.sales='PRIVATE',d=>d.requests[0].total=1]){const d=fixture();mutate(d);assert.throws(()=>validatePublic(d));}
});
test('users are replaced with stable aliases in each public response',()=>{
  const d=fixture();d.requests[0].user='Nombre privado';d.requests[1].user='Nombre privado';
  const safe=anonymizeUsers(d);assert.deepEqual(safe.requests.map(r=>r.user),['Usuario 1','Usuario 1']);assert.equal(d.requests[0].user,'Nombre privado');
});
test('original CSS and four tabs; weighted historical counts; monthly projection and filters',async()=>{
  const html=fs.readFileSync('public/index.html','utf8'),css=html.split('<style>')[1].split('</style>')[0].replace(/\r\n/g,'\n');assert.equal(createHash('sha256').update(css).digest('hex'),fs.readFileSync('original-style.sha256','utf8').trim());
  const dom=new JSDOM(html,{url:'http://localhost:3000',runScripts:'outside-only'}),w=dom.window;
  w.setInterval=()=>0;w.fetch=async()=>({ok:true,json:async()=>fixture()});w.eval(fs.readFileSync('public/dashboard.js','utf8'));await new Promise(r=>setTimeout(r,0));
  assert.equal(w.document.querySelectorAll('#tabs button').length,4);assert.equal(w.document.querySelector('.card div').textContent,'60');
  w.document.querySelector('[data-id="dispersals"]').click();assert.equal(w.document.querySelectorAll('.card').length,4);assert.equal(w.document.querySelectorAll('.card div')[1].textContent,'2');assert.equal(w.eval('monthly().projection'),100/29*31);assert.equal(w.document.querySelectorAll('tbody tr').length,31);assert.equal(w.document.querySelector('tbody tr:nth-child(10) td:last-child').textContent,'1.7%');
  w.document.getElementById('distributor').value='B';w.document.getElementById('distributor').onchange();assert.equal(w.eval('monthly().projection'),0);assert.equal(w.document.querySelectorAll('.card div')[1].textContent,'0');
  w.document.querySelector('[data-id="requests"]').click();assert.equal(w.document.querySelector('.card div').textContent,'60');assert.equal(w.requestRows().reduce((n,r)=>n+r.total,0),30);
  w.document.querySelector('[data-id="inventory"]').click();assert(w.document.querySelector('.report-title').textContent.includes('Inventario'));
  w.document.querySelector('[data-id="detail"]').click();assert(w.document.querySelector('#view').textContent.includes('Detalle de solicitudes'));assert(!w.document.querySelector('#view').textContent.includes('doc_ident'));
  w.document.getElementById('month').value='2026-11';assert.equal(w.eval('monthly().projection'),null);w.document.getElementById('month').value='2026-09';assert.equal(w.eval('monthly().projection'),200);
  dom.window.close();
});
test('public rows escaped; syntax valid; missing source fails without returning local snapshot',async()=>{
  new vm.Script(fs.readFileSync('public/dashboard.js','utf8'));assert(!fs.existsSync('public/data.json'));
  const original=process.env.SHEETS_PUBLIC_URL;delete process.env.SHEETS_PUBLIC_URL;
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};
  await handler({method:'GET'},res);assert.equal(res.statusCode,503);assert(!res.body.includes('PRIVATE'));assert.equal(res.headers['Cache-Control'],'no-store');
  if(original!==undefined)process.env.SHEETS_PUBLIC_URL=original;
  assert(fs.readFileSync('public/dashboard.js','utf8').includes('esc(c.v(x))'));
});
test('REAL Sheets snapshot agrees with the validated reference cut and contains no disallowed fields',{skip:!process.env.MX_LIVE_SNAPSHOT},()=>{
  const d=validatePublic(JSON.parse(fs.readFileSync(process.env.MX_LIVE_SNAPSHOT,'utf8')));
  assert.deepEqual(d.historicalTotals.requests,{total:9645,approved:2838,rejected:6426,unfinished:381});assert.equal(d.historicalTotals.activations,230);assert.equal(d.historicalTotals.sales,2057850);
  const month=d.dispersions.filter(r=>r.date.startsWith('2026-10'));assert.equal(month.reduce((n,r)=>n+r.credits,0),53);assert.equal(month.reduce((n,r)=>n+r.amount,0),453550);assert(Math.abs(d.monthlyTargets['2026-10']-850000)<0.01);
  for(const row of d.requests)assert(/^Usuario \d+$/.test(row.user));
});
