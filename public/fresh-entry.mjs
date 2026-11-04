// Cada documento nuevo exige Google. No se recupera una sesión por una
// cookie que Chrome haya restaurado al volver a abrir una pestaña.
export async function prepareFreshEntry({post,readSession}) {
  await post({action:'logout'});
  const state=await readSession();
  if(state.session)throw new Error('No fue posible cerrar la sesión anterior. Recarga la página.');
  return state;
}

export function closeWithPage({win=window,sessionId,hide,stop,reload=()=>win.location.reload()}) {
  let left=false;
  const leave=()=>{
    if(left)return;
    left=true;hide();stop();
    const body=JSON.stringify({action:'logout',sessionId});
    // Ayuda al cierre normal. La entrada nueva también borra la cookie,
    // incluso si el navegador no entregó esta solicitud al cerrarse.
    try {
      const queued=win.navigator.sendBeacon?.('/api/auth',new win.Blob([body],{type:'application/json'}));
      if(!queued)void win.fetch('/api/auth',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body}).catch(()=>{});
    }catch{}
  };
  const restore=event=>{if(event.persisted || left){hide();reload();}};
  win.addEventListener('pagehide',leave);
  win.addEventListener('pageshow',restore);
  return ()=>{win.removeEventListener('pagehide',leave);win.removeEventListener('pageshow',restore);};
}
