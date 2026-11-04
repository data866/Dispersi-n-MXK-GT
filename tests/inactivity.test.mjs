import test from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {newSession,getSession,refreshSession,seal,sessionCookie,ORIGIN} from '../lib/session.mjs';
import auth from '../api/auth.mjs';import {watchSession} from '../public/session-activity.mjs';
import data from '../api/data.mjs';
process.env.VERCEL_ENV='preview';delete process.env.VERCEL_GIT_COMMIT_REF;
process.env.GOOGLE_CLIENT_ID='fictional.apps.googleusercontent.com';process.env.MXK_SESSION_SECRET='fictional-idle-secret-'.repeat(4);
process.env.MXK_ACCESS_POLICY=JSON.stringify(Object.fromEntries(Array.from({length:27},(_,i)=>['test'+i+'@example.test',{principal:true,distribuidores:i<13,cartera:i>=9,descargaCartera:i>=19,administrar:false}])));
const email='test0@example.test';
function response(){return{headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};}
class Clock {
 constructor(){this.time=1800000000000;this.id=0;this.jobs=new Map();}
 now=()=>this.time;
 schedule=(fn,ms)=>{const id=++this.id;this.jobs.set(id,{fn,at:this.time+Math.max(0,ms)});return id;};
 cancel=id=>this.jobs.delete(id);
 async flush(){for(let i=0;i<12;i++)await Promise.resolve();}
 async advance(ms){const end=this.time+ms;for(;;){const next=[...this.jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.time=next[1].at;this.jobs.delete(next[0]);next[1].fn();await this.flush();}this.time=end;await this.flush();}
}
async function withClock(fn){const real=Date.now,clock=new Clock();Date.now=clock.now;try{await fn(clock);}finally{Date.now=real;}}
function issued(){return newSession({email,sub:'fictitious-sub',exp:Math.floor(Date.now()/1000)+3600});}
const request=payload=>({headers:{cookie:'__Host-mxkgt='+seal(payload)}});
test('server refuses the session at 300 seconds, including old one-hour cookies',async()=>withClock(async clock=>{
 const p=issued();assert.equal(p.exp-p.lastActivityAt,300);assert.ok(getSession(request(p)));
 await clock.advance(299000);assert.ok(getSession(request(p)));await clock.advance(1000);assert.equal(getSession(request(p)),null);assert.equal(refreshSession(request(p)),null);
 const old={kind:'session',sub:'fictitious-sub',email,aud:ORIGIN,exp:Math.floor(Date.now()/1000)+3600};assert.equal(getSession(request(old)),null);
 assert.ok(!sessionCookie(issued()).includes('Max-Age='));assert.ok(!sessionCookie(issued()).includes('Expires='));assert.ok(sessionCookie(null,0).includes('Max-Age=0'));
}));
test('explicit activity renews only a live session and never exceeds Google/absolute expiry',async()=>withClock(async clock=>{
 const p=issued();await clock.advance(120000);const renewed=refreshSession(request(p),15000);assert.equal(renewed.payload.lastActivityAt,p.lastActivityAt+105);assert.equal(renewed.payload.exp,p.exp+105);assert.equal(renewed.payload.absoluteExp,p.absoluteExp);
 assert.equal(refreshSession(request(p),-1),null);assert.equal(refreshSession(request(p),300000),null);
 const short=newSession({email,sub:'fictitious-sub',exp:Math.floor(Date.now()/1000)+10});assert.equal(short.exp,short.absoluteExp);await clock.advance(5000);assert.equal(refreshSession(request(short)).payload.exp,short.absoluteExp);
}));
test('GET/background access does not renew; expired activity POST is rejected; old tabs cannot clear a new session',async()=>withClock(async clock=>{
 const p=issued();let res=response();await auth({method:'GET',url:'/api/auth',...request(p)},res);assert.equal(res.body.session.expiresAt,p.exp);assert.equal(res.headers['Set-Cookie'],undefined);
 const headers={...request(p).headers,origin:ORIGIN,'content-type':'application/json'};await clock.advance(300000);res=response();await auth({method:'POST',url:'/api/auth',headers,body:{action:'activity'}},res);assert.equal(res.statusCode,401);assert.equal(res.headers['Set-Cookie'],undefined);
 res=response();await data({method:'GET',headers},res);assert.equal(res.statusCode,401);
 const fresh=issued();res=response();await auth({method:'POST',url:'/api/auth',headers:{...headers,...request(fresh).headers},body:{action:'logout',sessionId:p.sid}},res);assert.equal(res.headers['Set-Cookie'],undefined);assert.equal(res.body.sessionChanged,true);
}));
function browserHarness(clock){
 const dom=new JSDOM('<main><iframe></iframe></main>',{url:ORIGIN,pretendToBeVisual:true});
 let cookie=issued(),expired=0,posts=0,reads=0,changed=0;
 const controller=watchSession(getSession(request(cookie)),{win:dom.window,channel:null,now:clock.now,schedule:clock.schedule,cancel:clock.cancel,isUserEvent:()=>true,
  post:async body=>{posts++;const renewed=refreshSession(request(cookie),body.idleForMs);if(!renewed)throw Object.assign(new Error('expired'),{status:401});cookie=renewed.payload;return{session:renewed.session};},
  fetchSession:async()=>{reads++;return getSession(request(cookie));},onExpire:async()=>{expired++;},onSessionChanged:()=>changed++});
 return {dom,controller,counts:()=>({expired,posts,reads,changed}),replaceSession:()=>{cookie=issued();},close:()=>{controller.stop();dom.window.close();}};
}
test('idle browser hides the session after five minutes without any renewal POST',async()=>withClock(async clock=>{const h=browserHarness(clock);try{await clock.advance(300100);assert.equal(h.counts().expired,1);assert.equal(h.counts().posts,0);}finally{h.close();}}));
test('real module-frame interaction keeps the single central session active; background rendering does not',async()=>withClock(async clock=>{
 const h=browserHarness(clock);try{
  await clock.advance(240000);h.dom.window.document.querySelector('iframe').contentDocument.dispatchEvent(new h.dom.window.Event('pointerdown'));await clock.advance(1000);assert.equal(h.counts().posts,1);
  await clock.advance(100000);assert.equal(h.counts().expired,0);await clock.advance(201000);assert.equal(h.counts().expired,1);
 }finally{h.close();}
}));
test('a suspended old tab reloads to a new login without logging that new session out',async()=>withClock(async clock=>{const h=browserHarness(clock);try{await clock.advance(240000);h.replaceSession();await clock.advance(60100);assert.equal(h.counts().changed,1);assert.equal(h.counts().expired,0);}finally{h.close();}}));
test('activity in one tab keeps both tabs live; idle polling and stationary pointers do not',async()=>withClock(async clock=>{
 let cookie=issued(),posts=0;const expired=[0,0],channels=[];
 const doms=[0,1].map(()=>new JSDOM('<main></main>',{url:ORIGIN,pretendToBeVisual:true}));
 const controllers=doms.map((dom,index)=>{const channel={onmessage:null,postMessage(data){for(const other of channels)if(other!==this)other.onmessage?.({data});},close(){}};channels.push(channel);return watchSession(getSession(request(cookie)),{win:dom.window,channel,now:clock.now,schedule:clock.schedule,cancel:clock.cancel,isUserEvent:()=>true,post:async body=>{posts++;const result=refreshSession(request(cookie),body.idleForMs);cookie=result.payload;return{session:result.session};},fetchSession:async()=>getSession(request(cookie)),onExpire:async()=>expired[index]++,onSessionChanged:()=>{throw new Error('Unexpected session change');}});});
 try{await clock.advance(240000);doms[0].window.document.dispatchEvent(new doms[0].window.Event('pointermove'));await clock.advance(1000);assert.equal(posts,0);controllers[1].activity();await clock.advance(1000);assert.equal(posts,1);await clock.advance(70000);assert.deepEqual(expired,[0,0]);await clock.advance(230000);assert.deepEqual(expired,[1,1]);}finally{controllers.forEach(c=>c.stop());doms.forEach(d=>d.window.close());}
}));
