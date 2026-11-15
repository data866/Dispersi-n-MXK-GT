// La matriz privada vive exclusivamente en variables del Preview de esta rama.
export function getPolicy() {
 try {
  const policy = JSON.parse(process.env.MXK_ACCESS_POLICY || '{}');
  if (!policy || Array.isArray(policy) || Object.keys(policy).length !== 27) return {};
  for (const [email,rights] of Object.entries(policy)) {
   if (!email.includes('@') || !rights || ['principal','distribuidores','cartera','descargaCartera','administrar'].some(k=>typeof rights[k] !== 'boolean') || (rights.administrar && email !== 'data@maxikash.mx') || (rights.descargaCartera && !rights.cartera)) return {};
  }
  return policy;
 } catch {return {};}
}
export const permissions = email => { const policy=getPolicy(), key=String(email || '').toLowerCase(); if (!Object.hasOwn(policy,key)) return null; const rights=policy[key]; if (key === 'data@maxikash.mx' && process.env.VERCEL_ENV === 'production') return {principal:true,distribuidores:true,cartera:true,descargaCartera:true,administrar:true}; return key === 'alejandro.zamora@maxikash.mx' ? {...rights, distribuidores:true} : rights; };

