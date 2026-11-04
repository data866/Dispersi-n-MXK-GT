import {createPublicKey, verify, createHash} from 'node:crypto';
export const PORTAL_ORIGIN='https://dispersi-n-mxk-gt-git-demo-acceso-sobre-dashbo-9f7f29-data-3272.vercel.app';
export const AUDIENCE='maxikash:distribuidores:preview';
export const centralPreview=()=>process.env.VERCEL_ENV==='preview' && process.env.VERCEL_GIT_COMMIT_REF==='feat/sesion-central-guatemala';
export function requestHash(req) {
 const url=new URL(req.url,'https://module.invalid');
 return createHash('sha256').update((req.method || 'GET')+'\n'+url.pathname+url.search).digest('base64url');
}
export function centralEmail(req) {
 try {
  if (!centralPreview() || req.method !== 'GET') return null;
  const token=String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  if (token.length>4096) return null;
  const [version,payload,signature,extra]=token.split('.');
  if (version!=='MXK1' || !payload || !signature || extra || !process.env.MXK_CENTRAL_PUBLIC_KEY) return null;
  const key=createPublicKey({key:Buffer.from(process.env.MXK_CENTRAL_PUBLIC_KEY,'base64'),format:'der',type:'spki'});
  if (key.asymmetricKeyType!=='ed25519' || !verify(null,Buffer.from('MXK1.'+payload),key,Buffer.from(signature,'base64url'))) return null;
  const p=JSON.parse(Buffer.from(payload,'base64url').toString()),now=Math.floor(Date.now()/1000);
  if(p.iss!==PORTAL_ORIGIN || p.aud!==AUDIENCE || !Number.isInteger(p.exp) || p.exp<=now || p.exp>now+35 || !Number.isInteger(p.iat) || p.iat>now+5 || p.exp-p.iat>30 || !p.sub || typeof p.email!=='string' || p.module!=='distribuidores' || p.request!==requestHash(req)) return null;
  return p.email.toLowerCase();
 } catch { return null; }
}
