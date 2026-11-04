import {createHmac, timingSafeEqual, randomBytes} from 'node:crypto';
import {permissions} from './policy.mjs';
export const ORIGIN = 'https://dispersi-n-mxk-gt-git-demo-acceso-sobre-dashbo-9f7f29-data-3272.vercel.app';
export const COOKIE = '__Host-mxkgt';
const TTL = 3600;
function key() {
  if (process.env.VERCEL_ENV === 'production' || (process.env.VERCEL_GIT_COMMIT_REF && process.env.VERCEL_GIT_COMMIT_REF !== 'demo/acceso-sobre-dashboard-original')) throw new Error('Solo Preview autorizado');
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
  return `${name}=${payload ? seal(payload) : ''}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
export function getSession(req) {
  const p = unseal(cookieValue(req, COOKIE));
  const rights = p?.kind === 'session' && typeof p.sub === 'string' && p.sub ? permissions(p.email) : null;
  return rights ? {email:p.email, sub:p.sub, permissions:rights, expiresAt:p.exp} : null;
}
export function challenge() {
  return {kind:'challenge', nonce:randomBytes(32).toString('base64url'), aud:ORIGIN, exp:Math.floor(Date.now()/1000)+600};
}
export function newSession(identity) {
  return {kind:'session', email:identity.email.toLowerCase(), sub:identity.sub, aud:ORIGIN, exp:Math.min(identity.exp, Math.floor(Date.now()/1000)+TTL)};
}
export function sameOrigin(req) { return req.headers.origin === ORIGIN && !['cross-site','none'].includes(req.headers['sec-fetch-site']); }
