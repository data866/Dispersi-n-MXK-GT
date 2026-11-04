import {gzipSync} from 'node:zlib';
import {getSession,ORIGIN} from '../lib/session.mjs';
import {moduleAssertion} from '../lib/module-assertion.mjs';
const ALLOWED=new Set(['Distribuidores.html','gt-departamentos.json','api/distribuidores-data','api/distribuidores-data2025','api/distribuidores-vend','api/distribuidores-vend2025','api/distribuidores-tuberia','api/distribuidores-pii','api/access-admin']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const fail=(status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({error}));};
 if(req.method!=='GET'){res.setHeader('Allow','GET');return fail(405,'Las modificaciones de permisos están deshabilitadas.');}
 const session=getSession(req);
 if(!session)return fail(401,'Sesión central requerida.');
 if(!session.permissions.distribuidores)return fail(403,'No tienes acceso a Distribuidores.');
 const incoming=new URL(req.url,ORIGIN);
 const prefix='/modules/distribuidores/';
 const value=incoming.pathname.startsWith(prefix) ? decodeURIComponent(incoming.pathname.slice(prefix.length)) : req.query?.path ?? incoming.searchParams.get('path') ?? '';
 const rawPath=(Array.isArray(value) ? value.join('/') : String(value)).replace(/^\/+/, '');
 const path=rawPath==='Distribuidores' ? 'Distribuidores.html' : rawPath;
 if(!ALLOWED.has(path))return fail(404,'Ruta no disponible.');
 if(path==='api/access-admin' && !session.permissions.administrar)return fail(403,'Administración exclusiva de accesos.');
 try{
  if(process.env.VERCEL_ENV!=='preview' || process.env.VERCEL_GIT_COMMIT_REF!=='demo/acceso-sobre-dashboard-original')return fail(503,'Integración disponible solo en el Preview autorizado.');
  const target=new URL(process.env.MXK_DISTRIBUIDORES_URL || '');
  if(target.protocol!=='https:' || !target.hostname.endsWith('.vercel.app') || target.username || target.password || target.port || target.pathname!=='/' || target.search || target.hash)throw new Error('Destino pendiente');
  const upstream=new URL('/'+path,target);
  for(const [key,value] of incoming.searchParams){if(['year','pks','disp'].includes(key))upstream.searchParams.append(key,value);}
  const assertion=moduleAssertion(session,upstream.pathname+upstream.search);
  const response=await fetch(upstream,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+assertion},signal:AbortSignal.timeout(45000),cache:'no-store'});
  if(!response.ok)return fail(response.status===401||response.status===403?response.status:502,'No fue posible validar o cargar el módulo de Distribuidores.');
  const contentType=response.headers.get('content-type') || 'application/octet-stream';
  if(path.endsWith('.html') && !contentType.includes('text/html'))throw new Error('Respuesta inesperada');
  res.statusCode=200;res.setHeader('Content-Type',contentType);
  res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");
  for(const header of ['X-Rol','X-Can-Manage-Access']){const value=response.headers.get(header);if(value)res.setHeader(header,value);}
  const body=Buffer.from(await response.arrayBuffer());
  res.setHeader('Content-Encoding','gzip');return res.end(gzipSync(body));
 }catch{return fail(503,'Integración de Distribuidores pendiente de configurar.');}
}
