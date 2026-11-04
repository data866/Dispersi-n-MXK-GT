import {createPrivateKey,sign,createHash} from 'node:crypto';
import {ORIGIN} from './session.mjs';
export function moduleAssertion(session,path) {
 const now=Math.floor(Date.now()/1000);
 if(!session?.permissions?.distribuidores || session.expiresAt<=now) throw new Error('No autorizado');
 const key=createPrivateKey({key:Buffer.from(process.env.MXK_MODULE_PRIVATE_KEY || '','base64'),format:'der',type:'pkcs8'});
 if(key.asymmetricKeyType!=='ed25519')throw new Error('Clave no válida');
 const payload=Buffer.from(JSON.stringify({iss:ORIGIN,aud:'maxikash:distribuidores:preview',module:'distribuidores',sub:session.sub,email:session.email,iat:now,exp:Math.min(now+30,session.expiresAt),request:createHash('sha256').update('GET\n'+path).digest('base64url')})).toString('base64url');
 const value='MXK1.'+payload;
 return value+'.'+sign(null,Buffer.from(value),key).toString('base64url');
}
