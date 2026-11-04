import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import auth from '../api/auth.mjs';
import {newSession,sessionCookie,ORIGIN} from '../lib/session.mjs';
import {prepareFreshEntry,closeWithPage} from '../public/fresh-entry.mjs';
process.env.VERCEL_ENV='preview';delete process.env.VERCEL_GIT_COMMIT_REF;
process.env.GOOGLE_CLIENT_ID='fictional.apps.googleusercontent.com';process.env.MXK_SESSION_SECRET='fictional-entry-secret-'.repeat(4);
process.env.MXK_ACCESS_POLICY=JSON.stringify(Object.fromEntries(Array.from({length:27},(_,i)=>['test'+i+'@example.test',{principal:true,distribuidores:i<13,cartera:i>=9,descargaCartera:i>=19,administrar:false}])));
function restoredBrowser(){
 const cookieJar=new Map();const cookie=sessionCookie(newSession({email:'test0@example.test',sub:'fictional-sub',exp:Math.floor(Date.now()/1000)+3600})).split(';')[0];cookieJar.set(cookie.split('=')[0],cookie.slice(cookie.indexOf('=')+1));
 async function request(method,body){const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};await auth({method,url:'/api/auth',headers:{cookie:[...cookieJar].map(([k,v])=>k+'='+v).join('; '),origin:ORIGIN,'content-type':'application/json'},body},res);for(const line of [].concat(res.headers['Set-Cookie']||[])){const [pair]=line.split(';'),at=pair.indexOf('='),key=pair.slice(0,at);if(line.includes('Max-Age=0'))cookieJar.delete(key);else cookieJar.set(key,pair.slice(at+1));}if(res.statusCode!==200)throw new Error('HTTP '+res.statusCode);return res.body;}
 return {readSession:()=>request('GET'),post:body=>request('POST',body)};
}
test('reopening with a valid restored cookie clears the server cookie and requires a fresh Google challenge',async()=>{
 const browser=restoredBrowser();assert.ok((await browser.readSession()).session);const state=await prepareFreshEntry(browser);assert.equal(state.session,null);assert.ok(state.clientId);assert.ok(state.nonce);assert.equal((await browser.readSession()).session,null);
});
test('a failed server logout cannot expose the dashboard or silently resume the restored session',async()=>{
 let read=false;await assert.rejects(prepareFreshEntry({post:async()=>{throw new Error('offline');},readSession:async()=>{read=true;return{session:{email:'fictional'}};}}),/offline/);assert.equal(read,false);
 await assert.rejects(prepareFreshEntry({post:async()=>{},readSession:async()=>({session:{email:'fictional'}})}),/cerrar la sesión/);
});
test('leaving a page hides data and stops renewal; cached restoration requires a new document',()=>{
 const dom=new JSDOM('<main>Private dashboard</main>',{url:ORIGIN});let hidden=0,stopped=0,reloaded=0;const calls=[];
 dom.window.navigator.sendBeacon=(url,blob)=>{calls.push({url,blob});return true;};
 const dispose=closeWithPage({win:dom.window,sessionId:'fictional-session',hide:()=>hidden++,stop:()=>stopped++,reload:()=>reloaded++});
 dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(hidden,1);assert.equal(stopped,1);assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/auth');assert.equal(calls[0].blob.type,'application/json');
 dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(reloaded,1);dispose();dom.window.close();
});
test('blocked beacon falls back to keepalive and reopening still works when no close request was delivered',async()=>{
 const dom=new JSDOM('<main></main>',{url:ORIGIN});const requests=[];dom.window.navigator.sendBeacon=()=>false;dom.window.fetch=async(url,options)=>{requests.push({url,...options});throw new Error('browser closed');};
 const dispose=closeWithPage({win:dom.window,sessionId:'fictional-session',hide:()=>{},stop:()=>{},reload:()=>{}});dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));await Promise.resolve();assert.equal(requests.length,1);assert.equal(requests[0].keepalive,true);assert.deepEqual(JSON.parse(requests[0].body),{action:'logout',sessionId:'fictional-session'});dispose();dom.window.close();
 const state=await prepareFreshEntry(restoredBrowser());assert.equal(state.session,null);
});
