// Añadir al proyecto Actualizacion_Dashboard, junto al API_Vercel.gs validado.
// No cambia las hojas ni entrega solicitudes/ofertas individuales.
function construirSalidaPublicaMxk_() {
  const raw=construirDatosVercel_();
  const requests=new Map(),dispersions=new Map(),offers=new Map();
  const employees=new Map([...new Set(raw.requests.map(r=>r.user||''))].sort().map((name,i)=>[name,'Usuario '+String(i+1)]));
  function add(map,key,create){const k=JSON.stringify(key);if(!map.has(k))map.set(k,create());return map.get(k);}
  function dimension(value){const text=String(value||'Sin dato').trim();if(text.length>200||/@|\b\d{10,}\b/.test(text))throw new Error('Dimensión no apta para publicar');return text;}
  const totals={total:0,approved:0,rejected:0,unfinished:0};
  for(const r of raw.requests){
    const distributor=dimension(r.distributor),branch=dimension(r.branch),user=employees.get(r.user||'');
    const followup=dimension(r.followup),date=r.date,week=r.week;
    const x=add(requests,[date,week,distributor,branch,user,followup],()=>({date,week,distributor,branch,user,followup,total:0,approved:0,rejected:0,unfinished:0}));
    const status=r.buro==='APROBADO'?'approved':r.buro==='RECHAZADO'?'rejected':'unfinished';
    x.total++;x[status]++;totals.total++;totals[status]++;
  }
  let activations=0,sales=0;
  for(const r of raw.offers){
    const distributor=dimension(r.distributor),branch=dimension(r.branch);
    if(r.dispersedAt){const date=r.dispersedAt;const x=add(dispersions,[date,distributor,branch],()=>({date,distributor,branch,credits:0,amount:0}));x.credits++;x.amount+=r.amount;activations++;sales+=r.amount;}
    const month=(r.date||'').slice(0,7),stage=dimension(r.stage),brand=dimension(r.brand),model=dimension(r.model);
    const x=add(offers,[month,distributor,branch,stage,brand,model],()=>({month,distributor,branch,stage,brand,model,total:0,activated:0,amount:0}));
    x.total++;if(r.dispersedAt){x.activated++;x.amount+=r.amount;}
  }
  return {schemaVersion:3,source:'Google Sheets / Apps Script',updatedAt:Utilities.formatDate(new Date(),VERCEL_ZONA,"yyyy-MM-dd'T'HH:mm:ssXXX"),requests:[...requests.values()],dispersions:[...dispersions.values()].sort((a,b)=>a.date.localeCompare(b.date)),offers:[...offers.values()],historicalTotals:{requests:totals,activations,sales},monthlyTargets:raw.monthlyTargets,dailyTargets:raw.dailyTargets};
}
function doGet(){
  try{return ContentService.createTextOutput(JSON.stringify(construirSalidaPublicaMxk_())).setMimeType(ContentService.MimeType.JSON);}
  catch(error){return ContentService.createTextOutput(JSON.stringify({error:'No fue posible preparar los datos públicos'})).setMimeType(ContentService.MimeType.JSON);}
}
