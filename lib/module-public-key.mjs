import {createPrivateKey,createPublicKey,createHash} from 'node:crypto';
export function modulePublicKey(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='demo/acceso-sobre-dashboard-original')throw new Error('Solo Preview autorizado');
 const key=createPrivateKey({key:Buffer.from(process.env.MXK_MODULE_PRIVATE_KEY||'','base64'),format:'der',type:'pkcs8'});
 if(key.asymmetricKeyType!=='ed25519')throw new Error('Clave no válida');
 const der=createPublicKey(key).export({format:'der',type:'spki'});
 // Solo sale la parte pública. No se rota, exporta ni registra la privada.
 return {algorithm:'Ed25519',format:'SPKI-DER-base64',publicKey:der.toString('base64'),fingerprint:'SHA256:'+createHash('sha256').update(der).digest('base64url')};
}
