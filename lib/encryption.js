// AES-256-GCM encryption for Shopify access tokens at rest.
// ENCRYPTION_KEY must be 32 bytes, base64-encoded (run `openssl rand -base64 32`).
//
// Output format (base64): [12-byte IV][16-byte auth tag][ciphertext]
// Decrypt fails loud on tampering — GCM auth tag mismatch throws.

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function key() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error('Missing ENCRYPTION_KEY');
  const buf = Buffer.from(k, 'base64');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (got ' + buf.length + ')');
  }
  return buf;
}

export function encrypt(plaintext) {
  if (typeof plaintext !== 'string') throw new Error('encrypt expects a string');
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decrypt(payload) {
  if (typeof payload !== 'string') throw new Error('decrypt expects a string');
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
