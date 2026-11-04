import {OAuth2Client} from 'google-auth-library';
import {getPolicy, permissions} from '../lib/policy.mjs';
import {ORIGIN, getSession, challenge, sessionCookie, cookieValue, unseal, sameOrigin, newSession} from '../lib/session.mjs';
const googleClient = new OAuth2Client();
const CHALLENGE_COOKIE = '__Host-mxkgt-login';
export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  const send = (status,body) => {res.statusCode=status;return res.end(JSON.stringify(body));};
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId || process.env.VERCEL_ENV === 'production') return send(503,{error:'Acceso Preview pendiente de configurar.'});
    if (req.method === 'GET') {
      const session = getSession(req);
      if (new URL(req.url,ORIGIN).searchParams.get('view') === 'permissions') {
        if (!session) return send(401,{error:'Sesión requerida.'});
        if (!session.permissions.administrar) return send(403,{error:'Acceso exclusivo del administrador de permisos.'});
        return send(200,{users:Object.entries(getPolicy()).map(([email,rights])=>({email,...rights})),readOnly:true});
      }
      if (session) return send(200,{session});
      const login = challenge();
      res.setHeader('Set-Cookie',sessionCookie(login,600,CHALLENGE_COOKIE));
      return send(200,{session:null,clientId,nonce:login.nonce});
    }
    if (req.method !== 'POST') {res.setHeader('Allow','GET, POST');return send(405,{error:'Método no permitido.'});}
    if (!sameOrigin(req) || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(403,{error:'Origen no autorizado.'});
    if (Number(req.headers['content-length'] || 0)>20000) return send(413,{error:'Solicitud demasiado grande.'});
    let body=req.body;
    if (typeof body === 'string') {if(body.length>20000)return send(413,{error:'Solicitud demasiado grande.'});body=JSON.parse(body);}
    if (body?.action === 'logout') {
      res.setHeader('Set-Cookie',[sessionCookie(null,0),sessionCookie(null,0,CHALLENGE_COOKIE)]);
      return send(200,{ok:true});
    }
    if (body?.action !== 'login') return send(405,{error:'No se permiten cambios de usuarios o permisos en esta etapa.'});
    const pending = unseal(cookieValue(req,CHALLENGE_COOKIE));
    if (pending?.kind !== 'challenge' || body.nonce !== pending.nonce || typeof body.credential !== 'string' || body.credential.length>16000) return send(403,{error:'Solicitud de acceso vencida. Recarga la página.'});
    let identity;
    try {
      const ticket = await googleClient.verifyIdToken({idToken:body.credential,audience:clientId});
      identity=ticket.getPayload();
      if (!identity?.sub || identity.email_verified !== true || identity.nonce !== pending.nonce || identity.exp <= Date.now()/1000) throw new Error('Identidad no válida');
    } catch {return send(401,{error:'Google no pudo validar la identidad. Intenta iniciar sesión de nuevo.'});}
    if (!permissions(identity.email)) return send(403,{error:'Esta cuenta no tiene acceso autorizado a MAXIKASH Guatemala.'});
    res.setHeader('Set-Cookie',[sessionCookie(newSession(identity)),sessionCookie(null,0,CHALLENGE_COOKIE)]);
    return send(200,{ok:true});
  } catch {return send(503,{error:'Acceso Preview pendiente de configurar.'});}
}
