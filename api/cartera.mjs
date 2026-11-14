import {createPrivateKey,sign,createHash} from 'node:crypto';
import {getSession,ORIGIN} from '../lib/session.mjs';
const CARTERA_ORIGIN='https://cartera-guatemala-6c88ab1ac-data-3272.vercel.app';
const ROUTES={'':'/api/dashboard','dashboard':'/api/dashboard','api/cartera-gt-live':'/api/cartera-gt-live','api/cobranza-gt-live':'/api/cobranza-gt-live','api/cartera-gt-descarga':'/api/cartera-gt-descarga'};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const fail=(status,error,html=false)=>{
  res.statusCode=status;
  if(html){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'");
   return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso a Cartera Guatemala</title><style>body{font:15px Arial,sans-serif;color:#132d53;background:#fff;margin:0;padding:32px;line-height:1.6}h1{font-size:21px;color:#0047bb}</style><h1>Acceso a Cartera Guatemala</h1><p>'+error+'</p></html>');
  }
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({error}));
 };
 if(req.method!=='GET')return fail(405,'Solo consulta.');
 const session=getSession(req);
 if(!session)return fail(401,'Sesión central requerida.');
 if(process.env.VERCEL_ENV!=='production'||process.env.VERCEL_GIT_COMMIT_REF!=='main')return fail(503,'Despliegue no autorizado.');
 try{
  const url=new URL(req.url,ORIGIN),prefix='/modules/cartera/';
  const path=url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):String(req.query?.path??url.searchParams.get('path')??'');
  if(!Object.hasOwn(ROUTES,path))return fail(404,'Ruta no disponible.');
  const dashboard=path===''||path==='dashboard';
  if(!session.permissions.cartera)return fail(403,dashboard?'Tu cuenta no tiene permiso de consulta de Cartera Guatemala. La administración del portal no concede acceso a este módulo.':'Sin permiso de Cartera.',dashboard);
  if(path==='api/cartera-gt-descarga'&&!session.permissions.descargaCartera)return fail(403,'Sin permiso de descarga.');
  const target=new URL(CARTERA_ORIGIN);
  if(target.protocol!=='https:'||target.username||target.password||target.port||target.pathname!=='/'||target.origin!==CARTERA_ORIGIN||target.search||target.hash)return fail(503,'Destino de Cartera no válido.');
  target.pathname=ROUTES[path];
  for(const [key,value] of url.searchParams){if(['fecha','todos'].includes(key)&&path==='api/cartera-gt-descarga')target.searchParams.set(key,value);}
  const signedPath=target.pathname+target.search,now=Math.floor(Date.now()/1000);
  const key=createPrivateKey({key:Buffer.from(process.env.MXK_CARTERA_PRIVATE_KEY || '','base64'),format:'der',type:'pkcs8'});
  if(key.asymmetricKeyType!=='ed25519')return fail(503,'Clave no válida.');
  const payload={iss:ORIGIN,aud:'maxikash:cartera:production',module:'cartera',email:session.email,sub:session.sub,iat:now,exp:Math.min(now+30,session.expiresAt),request:createHash('sha256').update('GET\n'+signedPath).digest('base64url')};
  const value='MXK1.'+Buffer.from(JSON.stringify(payload)).toString('base64url');
  const oidcToken=req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  if(!oidcToken)return fail(503,'Identidad de Producción del portal no disponible.');
  const response=await fetch(target,{redirect:'manual',headers:{'x-vercel-trusted-oidc-idp-token':oidcToken,Authorization:'Bearer '+value+'.'+sign(null,Buffer.from(value),key).toString('base64url')},signal:AbortSignal.timeout(60000),cache:'no-store'});
  if(response.status>=300&&response.status<400){
   return fail(502,'Redirección no permitida.',dashboard);
  }
  res.statusCode=response.status;res.setHeader('Content-Type',response.headers.get('content-type')||'application/json');
  if(dashboard)res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");
  return res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error('Cartera gateway:',e.name);return fail(503,'No fue posible conectar con Cartera.');}
}
