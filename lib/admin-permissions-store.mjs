import {get, put} from '@vercel/blob';

const PATH='mxk-gt/admin-permissions-preview.json';
const KEYS=['principal','distribuidores','cartera','descargaCartera','administrar'];
const ADMIN='data@maxikash.mx';

export function validateAccessMatrix(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw Error('Matriz invalida');
  const result={};
  for(const [raw,rights] of Object.entries(value)){
    const email=raw.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email in result) throw Error('Correo invalido o duplicado');
    if(!rights || KEYS.some(key=>typeof rights[key]!=='boolean')) throw Error('Permisos incompletos');
    if(rights.administrar && email!==ADMIN) throw Error('Solo el administrador principal puede administrar');
    if(rights.descargaCartera && !rights.cartera) throw Error('Descarga requiere acceso a Cartera');
    result[email]=Object.fromEntries(KEYS.map(key=>[key,rights[key]]));
  }
  if(!result[ADMIN]?.administrar || !result[ADMIN]?.principal) throw Error('No se puede quitar el administrador principal');
  if(Object.keys(result).length>500) throw Error('Demasiados usuarios');
  return result;
}

function token(){
  if(process.env.VERCEL_ENV!=='preview') throw Error('Edicion permitida solo en Preview');
  const value=process.env.BLOB_READ_WRITE_TOKEN;
  if(!value) throw Error('Token privado de Blob no configurado');
  return value;
}

export async function readPreviewMatrix(base){
  const auth=token();
  const response=await get(PATH,{access:'private',token:auth});
  if(!response) return validateAccessMatrix(base);
  if(!response.stream) throw Error('No se pudo leer el almacenamiento privado');
  const raw=await new Response(response.stream).text();
  return validateAccessMatrix(JSON.parse(raw));
}

export async function writePreviewMatrix(value){
  const auth=token();
  const checked=validateAccessMatrix(value);
  await put(PATH,JSON.stringify(checked),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',token:auth});
  return checked;
}
