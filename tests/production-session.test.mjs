import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,sign} from 'node:crypto';
process.env.VERCEL_ENV='production';process.env.VERCEL_GIT_COMMIT_REF='main';
process.env.MXK_SESSION_SECRET='fictional-production-secret-'.repeat(3);
process.env.MXK_ACCESS_POLICY=JSON.stringify(Object.fromEntries(Array.from({length:27},(_,i)=>['test'+i+'@example.test',{principal:true,distribuidores:i<13,cartera:i>=9,descargaCartera:i>=19,administrar:false}])));
const pair=generateKeyPairSync('ed25519');
process.env.MXK_MODULE_PRIVATE_KEY=pair.privateKey.export({type:'pkcs8',format:'der'}).toString('base64');process.env.MXK_CENTRAL_PUBLIC_KEY=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
const {ORIGIN,seal,unseal,newSession,getSession,sameOrigin,sessionCookie}=await import('../lib/session.mjs');
const {moduleAssertion}=await import('../lib/module-assertion.mjs');
const {centralEmail}=await import('./central-session-copy.mjs');
const identity={email:'test0@example.test',sub:'fictitious-sub',exp:Math.floor(Date.now()/1000)+3600};
test('production host-only session is accepted and does not accept the Preview audience',()=>{
 assert.equal(ORIGIN,'https://dispersi-n-mxk-gt.vercel.app');const p=newSession(identity),cookie='__Host-mxkgt='+seal(p);assert.equal(getSession({headers:{cookie}}).email,identity.email);assert.equal(unseal(seal({...p,aud:'https://dispersi-n-mxk-gt-git-demo-acceso-sobre-dashbo-9f7f29-data-3272.vercel.app'})),null);assert.ok(sessionCookie(p).includes('Secure; HttpOnly; SameSite=Lax'));assert.equal(sameOrigin({headers:{origin:ORIGIN}}),true);assert.equal(sameOrigin({headers:{origin:'https://untrusted.example'}}),false);
});
test('Production assertions are bound to issuer, audience, GET path and fresh key',()=>{
 const session={email:identity.email,sub:identity.sub,expiresAt:identity.exp,permissions:{distribuidores:true}},path='/api/distribuidores-data';const token=moduleAssertion(session,path),req={method:'GET',url:path,headers:{authorization:'Bearer '+token}};assert.equal(centralEmail(req),identity.email);assert.equal(centralEmail({...req,url:'/api/distribuidores-pii'}),null);assert.equal(centralEmail({...req,method:'POST'}),null);
 const [version,data]=token.split('.');const claims=JSON.parse(Buffer.from(data,'base64url'));claims.aud='maxikash:distribuidores:preview';const encoded=Buffer.from(JSON.stringify(claims)).toString('base64url');const value=version+'.'+encoded;const previewAudience=value+'.'+sign(null,Buffer.from(value),pair.privateKey).toString('base64url');assert.equal(centralEmail({...req,headers:{authorization:'Bearer '+previewAudience}}),null);
 const publicKey=process.env.MXK_CENTRAL_PUBLIC_KEY;process.env.MXK_CENTRAL_PUBLIC_KEY=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'der'}).toString('base64');assert.equal(centralEmail(req),null);process.env.MXK_CENTRAL_PUBLIC_KEY=publicKey;
});
test('non-main Production deployment cannot issue sessions',()=>{process.env.VERCEL_GIT_COMMIT_REF='other';assert.throws(()=>seal(newSession(identity)));process.env.VERCEL_GIT_COMMIT_REF='main';});
