// Solo los eventos de usuario renuevan la sesión. Las consultas y refrescos de
// datos no cuentan como actividad. No se guardan tokens en almacenamiento web.
export function watchSession(initial, options) {
  const win=options.win || window, doc=win.document;
  const now=options.now || (()=>Date.now());
  const schedule=options.schedule || ((fn,ms)=>win.setTimeout(fn,ms));
  const cancel=options.cancel || (id=>win.clearTimeout(id));
  const idleMs=initial.idleTimeoutSeconds*1000;
  let session=initial, serverDeadline=initial.expiresAt*1000;
  let lastActivity=Math.min(now(),serverDeadline-idleMs), lastSent=-Infinity;
  let timer, pending, checking, refreshing, stopped=false, lastBroadcast=-Infinity;
  const channel=options.channel === undefined && win.BroadcastChannel ? new win.BroadcastChannel('mxk-session-activity') : options.channel;
  const cleanups=[], documents=new WeakSet(), frames=new WeakSet();
  const deadline=()=>Math.min(session.absoluteExpiresAt*1000,Math.max(serverDeadline,lastActivity+idleMs));
  const broadcast=message=>channel?.postMessage({...message,sessionId:session.sessionId});
  async function expire(notify=true) {
    if(stopped)return;
    stop();
    await options.onExpire();
    if(notify)broadcast({type:'logout'});
    channel?.close();
  }
  function update(next,notify=false) {
    if(next && next.sessionId!==session.sessionId){stop();channel?.close();options.onSessionChanged();return;}
    if(!next)return expire(false);
    session=next;serverDeadline=next.expiresAt*1000;
    lastActivity=Math.max(lastActivity,serverDeadline-idleMs);
    if(notify)broadcast({type:'renewed',expiresAt:next.expiresAt});
    arm();
  }
  async function check() {
    if(stopped||checking)return;
    checking=true;
    try {
      const next=await options.fetchSession();
      if(!next)return await expire();
      update(next);
    } catch {await expire();}
    finally{checking=false;}
  }
  function arm() {
    cancel(timer);
    if(stopped)return;
    timer=schedule(()=>{void check();},Math.max(0,Math.min(deadline(),serverDeadline)-now()+25));
  }
  async function renew() {
    pending=undefined;
    if(stopped||refreshing)return;
    if(now()>=deadline())return check();
    refreshing=true;lastSent=now();const sentActivity=lastActivity;
    try {
      const result=await options.post({action:'activity',sessionId:session.sessionId,idleForMs:Math.max(0,Math.floor(now()-lastActivity))});
      update(result.session,true);
    } catch(error) {
      if(error.status===409){stop();channel?.close();options.onSessionChanged();}
      else if(error.status===401||error.status===403)await expire();
      else arm();
    } finally{refreshing=false;if(!stopped && lastActivity>sentActivity && !pending)pending=schedule(()=>{void renew();},Math.max(0,Math.min(15000-(now()-lastSent),serverDeadline-now()-3000)));}
  }
  function activity() {
    if(stopped)return;
    if(now()>=deadline())return void check();
    lastActivity=now();
    if(now()-lastBroadcast>=1000){lastBroadcast=now();broadcast({type:'activity',at:lastActivity});}
    if(!pending&&!refreshing)pending=schedule(()=>{void renew();},Math.max(0,Math.min(15000-(now()-lastSent),serverDeadline-now()-3000)));
    arm();
  }
  function listen(target,type,fn,settings) {
    target.addEventListener(type,fn,settings);
    cleanups.push(()=>target.removeEventListener(type,fn,settings));
  }
  function bindDocument(current) {
    if(!current||documents.has(current))return;
    documents.add(current);
    const input=event=>{if(event.type==='pointermove' && !(event.movementX || event.movementY))return;if((options.isUserEvent ? options.isUserEvent(event) : event.isTrusted)&&doc.visibilityState!=='hidden')activity();};
    for(const type of ['pointerdown','pointermove','keydown','wheel','touchstart','input'])listen(current,type,input,{capture:true,passive:true});
  }
  function bindFrames() {
    for(const frame of doc.querySelectorAll('iframe')) {
      if(!frames.has(frame)) {
        frames.add(frame);
        listen(frame,'load',()=>{try{bindDocument(frame.contentDocument);}catch{}});
      }
      try{bindDocument(frame.contentDocument);}catch{/* Los módulos externos mantienen su protección. */}
    }
  }
  function stop() {
    stopped=true;cancel(timer);cancel(pending);
    observer?.disconnect();for(const remove of cleanups)remove();
  }
  bindDocument(doc);bindFrames();
  const observer=win.MutationObserver ? new win.MutationObserver(bindFrames) : null;
  observer?.observe(doc.body,{childList:true,subtree:true});
  const resumed=()=>{if(doc.visibilityState!=='hidden'&&now()>=Math.min(deadline(),serverDeadline))void check();};
  listen(doc,'visibilitychange',resumed);listen(win,'focus',resumed);listen(win,'pageshow',resumed);
  if(channel)channel.onmessage=({data})=>{
    if(stopped||data?.sessionId!==session.sessionId)return;
    if(data.type==='logout')return void expire(false);
    if(data.type==='activity'&&Number.isFinite(data.at)){lastActivity=Math.max(lastActivity,Math.min(now(),data.at));arm();}
    if(data.type==='renewed'&&Number.isFinite(data.expiresAt)&&data.expiresAt*1000>serverDeadline&&data.expiresAt*1000<=session.absoluteExpiresAt*1000){serverDeadline=data.expiresAt*1000;lastActivity=Math.max(lastActivity,serverDeadline-idleMs);arm();}
  };
  arm();
  return {activity,logout:()=>expire(),stop:()=>{stop();channel?.close();}};
}
