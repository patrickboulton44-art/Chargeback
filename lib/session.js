// HMAC-signed session cookie. Holds shop_domain (Shopify is the identity provider).
// Signing secret = SHOPIFY_API_SECRET (already required, app-controlled).

import crypto from 'node:crypto';
import { parseCookies, serializeCookie, appendSetCookie } from './cookies.js';

const COOKIE_NAME = 'cb_session';
const STATE_COOKIE_NAME = 'cb_oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const STATE_MAX_AGE = 60 * 10; // 10 min

function secret() {
  const s = process.env.SHOPIFY_API_SECRET;
  if (!s) throw new Error('Missing SHOPIFY_API_SECRET (used to sign session cookies)');
  return s;
}

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  let ok = false;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length) return null;
    ok = crypto.timingSafeEqual(a, b);
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function setSessionCookie(res, payload) {
  const token = sign(payload);
  appendSetCookie(res, serializeCookie(COOKIE_NAME, token, {
    path: '/',
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }));
}

export function clearSessionCookie(res) {
  appendSetCookie(res, serializeCookie(COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }));
}

export function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verify(cookies[COOKIE_NAME]);
}

export function setOauthStateCookie(res, payload) {
  const token = sign(payload);
  appendSetCookie(res, serializeCookie(STATE_COOKIE_NAME, token, {
    path: '/',
    maxAge: STATE_MAX_AGE,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }));
}

export function consumeOauthStateCookie(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const payload = verify(cookies[STATE_COOKIE_NAME]);
  // Always clear regardless
  appendSetCookie(res, serializeCookie(STATE_COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }));
  return payload;
}
