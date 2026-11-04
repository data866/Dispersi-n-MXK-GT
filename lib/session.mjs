import {createHmac, timingSafeEqual, randomBytes} from 'node:crypto';
import {permissions} from './policy.mjs';
export const ORIGIN = process.env.VERCEL_ENV === 'production' ? 'https://dispersi-n-mxk-gt.vercel.app' : 'https://dispersi-n-mxk-gt-git-demo-acceso-sobre-dashbo-9f7f29-data-3272.vercel.app';
export const COOKIE = '__Host-mxkgt';
const TTL = 3600;
export const IDLE_SECONDS = 300;
function key() {
  if (process.env.VERCEL_ENV === 'production' ? process.env.VERCEL_GIT_COMMIT_REF !== 'main' : (process.env.VERCEL_GIT_COMMIT_REF && process.env.VERCEL_GIT_COMMIT_REF !== 'demo/acceso-sobre-dashboard-original')) throw new Error('Despliegue no autorizado');
  const secret = process.env.MXK_SESSION_SECRET;
  if (!secret || secret.length < 43) throw new Error('Sesión pendiente de configurar');
  return secret;
}
function sign(value) { return createHmac('sha256', key()).update(value).digest('base64url'); }
export function seal(payload) {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${value}.${sign(value)}`;
}
export function unseal(token) {
  try {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const [value, signature, extra] = token.split('.');
    if (!value || !signature || extra) return null;
    const actual = Buffer.from(signature, 'base64url'), expected = Buffer.from(sign(value), 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (payload.aud !== ORIGIN || !Number.isFinite(payload.exp) || payload.exp <= Date.now()/1000 || payload.exp > Date.now()/1000 + TTL + 10) return null;
    return payload;
  } catch { return null; }
}
export function cookieValue(req, name) {
  return (req.headers?.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
}
export function sessionCookie(payload, maxAge = TTL, name = COOKIE) {
  const lifetime = maxAge === 0 ? '; Max-Age=0' : name === COOKIE ? '' : `; Max-Age=${maxAge}`;
  return `${name}=${payload ? seal(payload) : ''}; Path=/; Secure; HttpOnly; SameSite=Lax${lifetime}`;
}
function sessionInfo(p) {
  const now = Math.floor(Date.now()/1000);
  if (p?.kind !== 'session' || p.v !== 2 || typeof p.sid !== 'string' || !p.sid || typeof p.sub !== 'string' || !p.sub || !Number.isInteger(p.lastActivityAt) || p.lastActivityAt > now + 5 || !Number.isInteger(p.absoluteExp) || p.absoluteExp <= now || p.exp > p.absoluteExp || p.exp > p.lastActivityAt + IDLE_SECONDS) return null;
  const rights = permissions(p.email);
  return rights ? {email:p.email, sub:p.sub, permissions:rights, expiresAt:p.exp, absoluteExpiresAt:p.absoluteExp, idleTimeoutSeconds:IDLE_SECONDS, sessionId:p.sid} : null;
}
export function getSession(req) {
  return sessionInfo(unseal(cookieValue(req, COOKIE)));
}
export function refreshSession(req, idleForMs = 0) {
  if (!Number.isInteger(idleForMs) || idleForMs < 0 || idleForMs >= IDLE_SECONDS*1000) return null;
  const previous = unseal(cookieValue(req, COOKIE));
  if (!sessionInfo(previous)) return null;
  const now = Math.floor(Date.now()/1000);
  const lastActivityAt = Math.max(previous.lastActivityAt, now - Math.ceil(idleForMs/1000));
  const payload = {...previous, lastActivityAt, exp:Math.min(previous.absoluteExp,lastActivityAt+IDLE_SECONDS)};
  if (payload.exp <= now) return null;
  return {payload, session:sessionInfo(payload)};
}
export function challenge() {
  return {kind:'challenge', nonce:randomBytes(32).toString('base64url'), aud:ORIGIN, exp:Math.floor(Date.now()/1000)+600};
}
export function newSession(identity) {
  const now = Math.floor(Date.now()/1000), absoluteExp = Math.min(identity.exp,now+TTL);
  return {kind:'session',v:2,sid:randomBytes(16).toString('base64url'),email:identity.email.toLowerCase(),sub:identity.sub,aud:ORIGIN,lastActivityAt:now,absoluteExp,exp:Math.min(absoluteExp,now+IDLE_SECONDS)};
}
export function sameOrigin(req) { return req.headers.origin === ORIGIN && !['cross-site','none'].includes(req.headers['sec-fetch-site']); }


