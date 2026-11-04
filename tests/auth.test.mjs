import test from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal,newSession,getSession,sessionCookie,challenge,ORIGIN} from '../lib/session.mjs';
import {getPolicy,permissions} from '../lib/policy.mjs';
import auth from '../api/auth.mjs';
import data from '../api/data.mjs';
process.env.MXK_SESSION_SECRET='isolated-test-secret-'.repeat(4);
process.env.GOOGLE_CLIENT_ID='test.apps.googleusercontent.com';
process.env.VERCEL_ENV='preview';
// Datos ficticios: no se escriben ni prueban cambios sobre usuarios reales.
const fixture=Object.fromEntries(Array.from({length:27},(_,i)=>[i===0?'data@maxikash.mx':i===1?'gabriel.juarez@maxikash.mx':`test${i}@example.test`,{principal:true,distribuidores:i<13,cartera:i>=9,descargaCartera:i>=19,administrar:i===0}]));
process.env.MXK_ACCESS_POLICY=JSON.stringify(fixture);
const identity={email:'data@maxikash.mx',sub:'test-only-sub',exp:Math.floor(Date.now()/1000)+3600};
const req=(method='GET',body,headers={})=>({method,url:'/api/auth',body,headers});
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}};}
test('preserves original module matrix and exclusive administrator',()=>{
 const users=Object.values(getPolicy());assert.equal(users.length,27);assert.equal(users.filter(x=>x.distribuidores).length,13);assert.equal(users.filter(x=>x.cartera).length,18);assert.equal(users.filter(x=>x.descargaCartera).length,8);assert.equal(users.filter(x=>x.administrar).length,1);assert.equal(permissions('data@maxikash.mx').cartera,false);assert.equal(permissions('outsider@example.test'),null);
});
test('rejects modified, expired, wrong-audience and challenge cookies as sessions',()=>{
 const p=newSession(identity),token=seal(p);assert.equal(unseal(token).sub,identity.sub);assert.equal(unseal(token.slice(0,-2)+'XX'),null);assert.equal(unseal(seal({...p,exp:1})),null);assert.equal(unseal(seal({...p,aud:'https://other.test'})),null);assert.equal(getSession(req('GET',null,{cookie:'__Host-mxkgt='+seal(challenge())})),null);assert.equal(getSession(req('GET',null,{cookie:'__Host-mxkgt='+seal({...p,email:'outsider@example.test'})})),null);
});
test('cookie is host-only secure HttpOnly SameSite Lax',()=>{const cookie=sessionCookie(newSession(identity));for(const flag of ['Secure','HttpOnly','SameSite=Lax','Path=/','Max-Age=3600'])assert.ok(cookie.includes(flag));assert.ok(!cookie.includes('Domain='));});
test('permissions endpoint denies anonymous and non-admin sessions',async()=>{
 for(const [email,status] of [[null,401],['gabriel.juarez@maxikash.mx',403],['data@maxikash.mx',200]]){const r=response();const request=req('GET',null,email?{cookie:'__Host-mxkgt='+seal(newSession({...identity,email}))}:{});request.url+='?view=permissions';await auth(request,r);assert.equal(r.statusCode,status);if(status===200){assert.equal(r.body.users.length,27);assert.equal(r.body.readOnly,true);}}
});
test('cross-origin and missing challenge logins rejected; no permission mutations',async()=>{
 for(const [body,headers,status] of [[{action:'login',credential:'fake'},{origin:'https://evil.test','content-type':'application/json'},403],[{action:'login',credential:'fake'},{origin:ORIGIN,'content-type':'application/json'},403],[{action:'update',email:identity.email},{origin:ORIGIN,'content-type':'application/json'},405]]){const r=response();await auth(req('POST',body,headers),r);assert.equal(r.statusCode,status);}
});
test('invalid Google signature cannot establish a session',async()=>{
 const pending=challenge(),r=response();await auth(req('POST',{action:'login',nonce:pending.nonce,credential:'not-a-google-token'},{origin:ORIGIN,'content-type':'application/json',cookie:'__Host-mxkgt-login='+seal(pending)}),r);assert.equal(r.statusCode,401);assert.equal(r.headers['Set-Cookie'],undefined);
});
test('production and other branches fail closed',()=>{process.env.VERCEL_ENV='production';assert.equal(getSession(req('GET',null,{cookie:'__Host-mxkgt='+ 'bad'})),null);assert.throws(()=>seal(newSession(identity)));process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='main';assert.throws(()=>seal(newSession(identity)));delete process.env.VERCEL_GIT_COMMIT_REF;});
test('data API rejects anonymous requests before reaching the Sheets source',async()=>{
 const original=global.fetch;let called=false;global.fetch=async()=>{called=true;throw new Error('No network in test');};
 try{const r=response();await data({method:'GET',headers:{}},r);assert.equal(r.statusCode,401);assert.equal(called,false);}finally{global.fetch=original;}
});
