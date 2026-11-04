import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {moduleAssertion} from '../lib/module-assertion.mjs';
import {centralEmail} from './central-session-copy.mjs';
import proxy from '../api/distribuidores.mjs';
import {seal,newSession,ORIGIN} from '../lib/session.mjs';
const pair=generateKeyPairSync('ed25519');
process.env.MXK_MODULE_PRIVATE_KEY=pair.privateKey.export({type:'pkcs8',format:'der'}).toString('base64');
process.env.MXK_CENTRAL_PUBLIC_KEY=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
process.env.MXK_SESSION_SECRET='fictional-test-session-secret-'.repeat(3);
process.env.MXK_ACCESS_POLICY=JSON.stringify(Object.fromEntries(Array.from({length:27},(_,i)=>['test'+i+'@example.test',{principal:true,distribuidores:i<13,cartera:i>=9,descargaCartera:i>=19,administrar:false}])));
const session={email:'test0@example.test',sub:'fictional-sub',expiresAt:Math.floor(Date.now()/1000)+600,permissions:{distribuidores:true}};
const path='/api/distribuidores-data';
const request=(url=path,token)=>({url,method:'GET',headers:token?{authorization:'Bearer '+token}:{}});
const response=()=>({headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});
function distEnv(){process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='feat/sesion-central-guatemala';}
function portalEnv(){process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='demo/acceso-sobre-dashboard-original';}
test('signed assertions accepted only for the exact read request and authorized Preview',()=>{
 distEnv();const token=moduleAssertion(session,path);assert.equal(centralEmail(request(path,token)),session.email);
 for(const req of [request(path),request(path,token.slice(0,-8)+'tampered'),request('/api/distribuidores-pii',token),{...request(path,token),method:'POST'}])assert.equal(centralEmail(req),null);
 process.env.VERCEL_ENV='production';assert.equal(centralEmail(request(path,token)),null);
 distEnv();process.env.VERCEL_GIT_COMMIT_REF='main';assert.equal(centralEmail(request(path,token)),null);
});
test('expired assertions and users without module permission are rejected',()=>{
 distEnv();assert.throws(()=>moduleAssertion({...session,permissions:{}},path));assert.throws(()=>moduleAssertion({...session,expiresAt:1},path));
});
test('gateway denies anonymous, unlisted paths, other module users, administrators and all mutations as applicable',async()=>{
 portalEnv();const allowed='__Host-mxkgt='+seal(newSession({email:session.email,sub:session.sub,exp:session.expiresAt}));
 const other='__Host-mxkgt='+seal(newSession({email:'test26@example.test',sub:'other-fictitious-sub',exp:session.expiresAt}));
 for(const [path,headers,method,status] of [['api/distribuidores-data',{},'GET',401],['api/distribuidores-data',{cookie:other},'GET',403],['api/_datos.mjs',{cookie:allowed},'GET',404],['api/access-admin',{cookie:allowed},'GET',403],['api/access-admin',{cookie:allowed},'POST',405]]){
  const res=response();await proxy({method,url:'/api/distribuidores?path='+path,headers,query:{path}},res);assert.equal(res.statusCode,status);
 }
});
test('server gateway hides assertions from the browser and drops user supplied headers',async()=>{
 portalEnv();process.env.MXK_DISTRIBUIDORES_URL='https://isolated-module.example.vercel.app';
 const cookie='__Host-mxkgt='+seal(newSession({email:session.email,sub:session.sub,exp:session.expiresAt}));
 const original=global.fetch;let forwarded;
 global.fetch=async(url,options)=>{forwarded=options;return new Response('{"fictional":true}',{headers:{'Content-Type':'application/json','X-Rol':'admin'}});};
 try{const res=response();await proxy({method:'GET',url:'/api/distribuidores?path=api/distribuidores-data',query:{path:'api/distribuidores-data'},headers:{cookie,authorization:'Bearer untrusted'}},res);assert.equal(res.statusCode,200);assert.ok(forwarded.headers.Authorization.startsWith('Bearer MXK1.'));assert.equal(forwarded.headers.Cookie,undefined);assert.ok(!res.headers.Authorization);assert.ok(!res.headers['Set-Cookie']);assert.equal(res.headers['X-Rol'],'admin');}
 finally{global.fetch=original;}
});
test('logout removes gateway access immediately because each request requires the central cookie',async()=>{
 portalEnv();const res=response();await proxy({method:'GET',url:'/api/distribuidores?path=api/distribuidores-data',query:{path:'api/distribuidores-data'},headers:{}},res);assert.equal(res.statusCode,401);
});
test('Vercel original URLs, clean HTML URLs and array rewrite parameters resolve only allowed routes',async()=>{
 portalEnv();process.env.MXK_DISTRIBUIDORES_URL='https://isolated-module.example.vercel.app';
 const cookie='__Host-mxkgt='+seal(newSession({email:session.email,sub:session.sub,exp:session.expiresAt}));
 const original=global.fetch;let target;
 global.fetch=async url=>{target=url.pathname;return new Response('fictional',{headers:{'Content-Type':target.endsWith('.html')?'text/html':'application/json'}});};
 try{for(const [url,query,expected] of [['/modules/distribuidores/Distribuidores.html',{},'/Distribuidores.html'],['/modules/distribuidores/Distribuidores',{},'/Distribuidores.html'],['/modules/distribuidores/api/distribuidores-data',{},path],['/api/distribuidores',{path:['api','distribuidores-data']},path]]){const res=response();await proxy({method:'GET',url,query,headers:{cookie}},res);assert.equal(res.statusCode,200);assert.equal(target,expected);}}
 finally{global.fetch=original;}
});
