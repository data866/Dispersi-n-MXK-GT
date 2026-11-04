(() => {
'use strict';
const main = document.querySelector('main.sheet');
main.hidden = true; main.inert = true;
const host = document.createElement('div'); host.id = 'mxk-access';
document.body.prepend(host); const root = host.attachShadow({mode:'open'});
const styles = `
:host{--blue:#0047bb;--nav:#06388e;--ink:#132d53;--muted:#6d7e96;--lime:#d2d755;--bg:#f1f5fb;--line:#e2e9f2}*{box-sizing:border-box}:host{margin:0;font:14px Arial,sans-serif;color:var(--ink);background:var(--bg)}button,input,select{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #afbc22;outline-offset:3px}button:disabled{cursor:not-allowed;opacity:.45}.demo{padding:10px 20px;background:#f9f7d9;text-align:center;color:#5c601d;font-size:12px;position:relative;z-index:2}.demo b{margin-right:12px}.brand{display:flex;align-items:center;gap:10px;font-size:25px;letter-spacing:-1px;font-weight:800;color:var(--blue)}.brand img{width:155px;height:auto;max-height:44px;object-fit:contain}.login{min-height:100vh;display:grid;grid-template-columns:1.1fr 1fr}.hero{background:linear-gradient(145deg,#0047bb,#052e79);color:white;padding:9vw 6vw;position:relative;overflow:hidden}.hero:after{content:'';width:440px;height:440px;border:80px solid #ffffff0b;transform:rotate(45deg);position:absolute;right:-240px;bottom:-220px}.hero .eyebrow{color:#e0e781}.hero h1{font-size:clamp(36px,4.4vw,64px);line-height:1.08;letter-spacing:-2px;max-width:620px;margin:28px 0}.hero p{color:#c8d8f2;line-height:1.8;max-width:460px}.hero .chips{display:flex;gap:9px;flex-wrap:wrap;margin-top:40px}.chips span{padding:10px 12px;border:1px solid #ffffff40;border-radius:9px;font-size:12px}.sign{display:flex;align-items:center;justify-content:center;padding:45px}.signbox{max-width:390px;width:100%}.sign h2{font-size:30px;letter-spacing:-1px;margin:45px 0 12px}.sub{color:var(--muted);line-height:1.6}.primary{background:var(--blue);border:0;color:white;padding:13px 18px;border-radius:9px;font-weight:700}.ghost{background:white;border:1px solid var(--line);padding:11px 15px;border-radius:9px;color:var(--ink)}.google{display:flex;gap:16px;align-items:center;justify-content:center;width:100%;margin:28px 0 16px}.google strong{font-size:22px;color:#4285f4}.hint{font-size:12px;color:var(--muted);line-height:1.6}.sign select{width:100%;margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:8px;background:white}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700}@media(max-width:650px){.login{grid-template-columns:1fr}.hero{padding:35px 25px}.hero h1{font-size:34px;margin:16px 0}.hero .chips{margin-top:20px}.hero p{font-size:13px}.sign{padding:30px 25px}.sign h2{margin-top:12px}.sign .brand{display:none}}`;
const post = async body => {
 const response = await fetch('/api/auth', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result = await response.json(); if (!response.ok) {const error=new Error(result.error || 'No fue posible iniciar sesión.');error.status=response.status;throw error;} return result;
};
const showError = error => {const el=root.querySelector('[role="status"]');if(el)el.textContent=error.message;};
async function start(session) {
 host.remove(); main.hidden=false; main.inert=false;
 const tools=document.createElement('div');document.body.prepend(tools); const ui=tools.attachShadow({mode:'open'});
 ui.innerHTML='<style>:host{display:block;font:12px Arial;background:#fff;color:#06388e}section{display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:8px 20px;flex-wrap:wrap}button{background:white;color:#0047bb;border:1px solid #cbd6ed;border-radius:6px;padding:6px 10px;cursor:pointer}dialog{max-width:94vw;max-height:80vh;border:1px solid #cbd6ed;border-radius:10px;padding:20px;color:#132d53}table{border-collapse:collapse;font-size:12px}td,th{padding:9px;border-bottom:1px solid #e2e9f2;text-align:left}</style><section><span id="identity"></span><button id="logout">Salir</button></section><dialog><h2>Permisos por módulo</h2><p>Consulta de permisos actuales. La edición aún no está habilitada.</p><div id="permissions"></div><button id="close">Cerrar</button></dialog>';
 ui.getElementById('identity').textContent=session.email;
 ui.getElementById('logout').onclick=async()=>{try{await post({action:'logout'});location.reload();}catch(e){alert(e.message);}};
 if(session.permissions.administrar){
  const button=document.createElement('button');button.textContent='Administración de accesos';ui.querySelector('section').insertBefore(button,ui.getElementById('logout'));
  button.onclick=async()=>{try{const r=await fetch('/api/auth?view=permissions',{cache:'no-store'});const result=await r.json();if(!r.ok)throw new Error(result.error);const target=ui.getElementById('permissions');target.replaceChildren();const table=document.createElement('table');const head=table.createTHead().insertRow();for(const label of ['Usuario','Principal','Distribuidores','Cartera','Descarga Cartera','Administra']){const cell=document.createElement('th');cell.textContent=label;head.append(cell);}for(const user of result.users){const row=table.insertRow();for(const value of [user.email,...['principal','distribuidores','cartera','descargaCartera','administrar'].map(k=>user[k]?'Sí':'—')])row.insertCell().textContent=value;}target.append(table);ui.querySelector('dialog').showModal();}catch(e){alert(e.message);}};
 }
 ui.getElementById('close').onclick=()=>ui.querySelector('dialog').close();
 const {summaryView}=await import('/summary-view.mjs');window.summaryView=summaryView;
 const script=document.createElement('script');script.src='/dashboard.js';document.body.append(script);
 const {watchSession}=await import('/session-activity.mjs');
 const activity=watchSession(session,{
  post,
  fetchSession:async()=>{const response=await fetch('/api/auth',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error('No fue posible comprobar la sesión.');return (await response.json()).session;},
  onSessionChanged:()=>{main.hidden=true;main.inert=true;tools.remove();location.reload();},
  onExpire:async()=>{main.hidden=true;main.inert=true;main.querySelectorAll('iframe').forEach(frame=>frame.remove());tools.remove();try{await post({action:'logout',sessionId:session.sessionId});}catch{}location.reload();}
 });
 ui.getElementById('logout').onclick=()=>activity.logout();
}
async function login(config) {
 root.innerHTML=`<style>${styles}</style><div class="login"><section class="hero"><div class="eyebrow">MAXIKASH · GUATEMALA</div><h1>Tu operación.<br>Una sola entrada.</h1><p>Los indicadores, distribuidores y cartera que necesitas, reunidos en un mismo lugar.</p><div class="chips"><span>Resumen General</span><span>Distribuidores</span><span>Cartera Guatemala</span></div></section><section class="sign"><div class="signbox"><div class="brand"><img src="/logo-maxikash.png" alt="Maxikash"></div><h2>Bienvenido de nuevo</h2><p class="sub">Accede a tu espacio de trabajo con tu cuenta de Google.</p><div id="google" style="margin:28px 0 16px"></div><p class="hint" role="status" aria-live="polite">Preparando acceso seguro…</p></div></section></div>`;
 if(!config){showError(new Error('No fue posible preparar el acceso. Recarga la página.'));return;}
 const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;
 script.onerror=()=>showError(new Error('No fue posible conectar con Google.'));
 script.onload=()=>{
  google.accounts.id.initialize({client_id:config.clientId,nonce:config.nonce,auto_select:false,callback:async result=>{
   try{showError(new Error('Validando tu cuenta en el servidor…'));await post({action:'login',credential:result.credential,nonce:config.nonce});location.reload();}catch(e){showError(e);}
  }});
  google.accounts.id.renderButton(root.getElementById('google'),{theme:'outline',size:'large',text:'continue_with',width:Math.min(390,window.innerWidth-50)});
  showError(new Error('Usa tu cuenta autorizada de MAXIKASH.'));
 };document.head.append(script);
}
(async()=>{try{const r=await fetch('/api/auth',{cache:'no-store',credentials:'same-origin'});const state=await r.json();if(!r.ok)throw new Error(state.error);if(state.session)await start(state.session);else await login(state);}catch(e){await login(null);showError(e);}})();
})();

