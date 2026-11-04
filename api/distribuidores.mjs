import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getSession,ORIGIN} from '../lib/session.mjs';
import data from 'mxk-distribuidores/api/distribuidores-data.js';
import data2025 from 'mxk-distribuidores/api/distribuidores-data2025.js';
import vendedores from 'mxk-distribuidores/api/distribuidores-vend.js';
import vendedores2025 from 'mxk-distribuidores/api/distribuidores-vend2025.js';
import tuberia from 'mxk-distribuidores/api/distribuidores-tuberia.js';
import pii from 'mxk-distribuidores/api/distribuidores-pii.js';
const require=createRequire(import.meta.url);
const HANDLERS={'api/distribuidores-data':data,'api/distribuidores-data2025':data2025,'api/distribuidores-vend':vendedores,'api/distribuidores-vend2025':vendedores2025,'api/distribuidores-tuberia':tuberia,'api/distribuidores-pii':pii};
const ASSETS={'Distribuidores.html':()=>readFile(require.resolve('mxk-distribuidores/Distribuidores.html')),'gt-departamentos.json':()=>readFile(require.resolve('mxk-distribuidores/gt-departamentos.json'))};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const fail=(status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({error}));};
 if(req.method!=='GET'){res.setHeader('Allow','GET');return fail(405,'Las modificaciones de permisos están deshabilitadas.');}
 const session=getSession(req);
 if(!session)return fail(401,'Sesión central requerida.');
 if(!session.permissions.distribuidores)return fail(403,'No tienes acceso a Distribuidores.');
 const incoming=new URL(req.url,ORIGIN),prefix='/modules/distribuidores/';
 const value=incoming.pathname.startsWith(prefix)?decodeURIComponent(incoming.pathname.slice(prefix.length)):req.query?.path??incoming.searchParams.get('path')??'';
 const raw=(Array.isArray(value)?value.join('/'):String(value)).replace(/^\/+/, '');
 const path=raw==='Distribuidores'?'Distribuidores.html':raw;
 if(!Object.hasOwn(ASSETS,path)&&!Object.hasOwn(HANDLERS,path))return fail(404,'Ruta no disponible.');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='demo/acceso-sobre-dashboard-original')return fail(503,'Integración disponible solo en el Preview autorizado.');
 try{
  if(Object.hasOwn(ASSETS,path)){
   const bytes=await ASSETS[path]();res.statusCode=200;
   res.setHeader('Content-Type',path.endsWith('.html')?'text/html; charset=utf-8':'application/json; charset=utf-8');
   res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");
   res.setHeader('Content-Encoding','gzip');return res.end(gzipSync(bytes));
  }
  const query={};for(const [key,value] of incoming.searchParams){if(['year','pks','disp'].includes(key))query[key]=value;}
  const moduleRequest={method:'GET',url:'/'+path,headers:{},query,[Symbol.for('maxikash.portal.verified-session')]:{email:session.email,sub:session.sub}};
  // Los handlers originales vuelven a aplicar accessFor() y los límites de PII.
  return await HANDLERS[path](moduleRequest,res);
 }catch(error){console.error('MXK module:',error.name,error.message);return fail(503,'No fue posible cargar Distribuidores.');}
}
