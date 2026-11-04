import test from 'node:test';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import proxy from '../api/distribuidores.mjs';
import {seal,newSession} from '../lib/session.mjs';
import {localPortalEmail} from 'mxk-distribuidores/lib/central-session.mjs';
process.env.MXK_SESSION_SECRET='fictional-test-session-secret-'.repeat(3);
process.env.GOOGLE_CLIENT_ID='fictional.apps.googleusercontent.com';
process.env.MXK_ACCESS_POLICY=JSON.stringify(Object.fromEntries(Array.from({length:27},(_,i)=>['test'+i+'@example.test',{principal:true,distribuidores:i<13,cartera:i>=9,descargaCartera:i>=19,administrar:false}])));
process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='demo/acceso-sobre-dashboard-original';
const identity={email:'test0@example.test',sub:'fictional-sub',exp:Math.floor(Date.now()/1000)+600};
const cookie=()=> '__Host-mxkgt='+seal(newSession(identity));
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.body=JSON.stringify(data);return this;},send(data){this.body=data;return this;},end(data){this.body=data;return this;}};}
test('gateway requires a central session, original module permission, allowed path and GET',async()=>{
 const other='__Host-mxkgt='+seal(newSession({...identity,email:'test26@example.test'}));
 for(const [path,headers,method,status] of [['api/distribuidores-data',{},'GET',401],['api/distribuidores-data',{cookie:other},'GET',403],['api/_datos.mjs',{cookie:cookie()},'GET',404],['api/access-admin',{cookie:cookie()},'POST',405],['api/access-admin',{cookie:cookie()},'GET',404]]){const res=response();await proxy({method,url:'/modules/distribuidores/'+path,headers},res);assert.equal(res.statusCode,status);}
});
test('serves original HTML without a second Google control and original geographic asset',async()=>{
 for(const [path,query] of [['/modules/distribuidores/Distribuidores.html',{}],['/modules/distribuidores/Distribuidores',{}],['/api/distribuidores',{path:['gt-departamentos.json']}]]){const res=response();await proxy({method:'GET',url:path,query,headers:{cookie:cookie()}},res);assert.equal(res.statusCode,200);const body=gunzipSync(res.body).toString();assert.ok(body.length>100);if(path.includes('Distribuidores')){assert.ok(body.includes('Resultados Generales'));assert.ok(!body.includes('id="gbtn"'));assert.ok(!body.includes('accounts.google.com/gsi/client'));}}
});
test('module applies its own original whitelist after the central session check',async()=>{
 const res=response();await proxy({method:'GET',url:'/modules/distribuidores/api/distribuidores-data',headers:{cookie:cookie()}},res);assert.equal(res.statusCode,403);assert.ok(String(res.body).includes('no autorizado'));
});
test('HTTP strings cannot create the private server identity context',()=>{
 const req={headers:{'maxikash.portal.verified-session':identity},body:{'maxikash.portal.verified-session':identity},query:{email:identity.email}};
 assert.equal(localPortalEmail(req),null);
 assert.equal(localPortalEmail({...req,[Symbol.for('maxikash.portal.verified-session')]:identity}),identity.email);
 process.env.VERCEL_ENV='production';assert.equal(localPortalEmail({...req,[Symbol.for('maxikash.portal.verified-session')]:identity}),null);process.env.VERCEL_ENV='preview';
});
test('protected APIs reject calls immediately after central cookie removal',async()=>{
 const res=response();await proxy({method:'GET',url:'/modules/distribuidores/api/distribuidores-data',headers:{}},res);assert.equal(res.statusCode,401);
});
