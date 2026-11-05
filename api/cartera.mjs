import {createPrivateKey,sign,createHash} from 'node:crypto';
import {getSession,ORIGIN} from '../lib/session.mjs';
const ROUTES={'':'/api/dashboard','api/cartera-gt-live':'/api/cartera-gt-live','api/cobranza-gt-live':'/api/cobranza-gt-live','api/cartera-gt-descarga':'/api/cartera-gt-descarga','api/diagnostico-mysql-gt':'/api/diagnostico-mysql-gt'};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const fail=(status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({error}));};
 if(req.method!=='GET')return fail(405,'Solo consulta.');
 const session=getSession(req);
 if(!session)return fail(401,'Sesión central requerida.');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='demo/acceso-sobre-dashboard-original')return fail(503,'Solo Preview.');
 try{
  const url=new URL(req.url,ORIGIN),prefix='/modules/cartera/';
  const path=url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):String(req.query?.path??url.searchParams.get('path')??'');
  if(!Object.hasOwn(ROUTES,path))return fail(404,'Ruta no disponible.');
  const diagnostic=path==='api/diagnostico-mysql-gt';
  if(diagnostic ? !(session.permissions.administrar && session.email==='data@maxikash.mx') : !session.permissions.cartera)return fail(403,'Sin permiso de Cartera.');
  if(path==='api/cartera-gt-descarga'&&!session.permissions.descargaCartera)return fail(403,'Sin permiso de descarga.');
  const target=new URL(process.env.MXK_CARTERA_URL || 'https://cartera-guatemala-git-feat-sesion-central-maxikash-data-3272.vercel.app/');
  if(target.protocol!=='https:'||target.username||target.password||target.port||target.pathname!=='/'||!target.hostname.endsWith('.vercel.app')||target.search||target.hash)return fail(503,'Destino Preview pendiente.');
  target.pathname=ROUTES[path];
  for(const [key,value] of url.searchParams){if(['fecha','todos'].includes(key)&&path==='api/cartera-gt-descarga')target.searchParams.set(key,value);}
  const signedPath=target.pathname+target.search,now=Math.floor(Date.now()/1000);
  const key=createPrivateKey({key:Buffer.from(process.env.MXK_MODULE_PRIVATE_KEY || '','base64'),format:'der',type:'pkcs8'});
  if(key.asymmetricKeyType!=='ed25519')return fail(503,'Clave no válida.');
  const payload={iss:ORIGIN,aud:'maxikash:cartera:preview',module:'cartera',email:session.email,sub:session.sub,iat:now,exp:Math.min(now+30,session.expiresAt),request:createHash('sha256').update('GET\n'+signedPath).digest('base64url')};
  const value='MXK1.'+Buffer.from(JSON.stringify(payload)).toString('base64url');
  const response=await fetch(target,{redirect:'manual',headers:{Authorization:'Bearer '+value+'.'+sign(null,Buffer.from(value),key).toString('base64url')},signal:AbortSignal.timeout(60000),cache:'no-store'});
  if(response.status>=300&&response.status<400)return fail(502,'Redirección no permitida.');
  res.statusCode=response.status;res.setHeader('Content-Type',response.headers.get('content-type')||'application/json');
  if(path==='')res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");
  return res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error('Cartera Preview gateway:',e.name);return fail(503,'No fue posible conectar con Cartera.');}
}
