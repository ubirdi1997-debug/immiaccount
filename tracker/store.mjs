import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const defaultFile = resolve(fileURLToPath(new URL('.', import.meta.url)), 'data/db.json');
export function readStore(file = defaultFile) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { accounts: [] };
}
export function writeStore(data, file = defaultFile) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}
export function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128;
}
export function validLogin(login) {
  return typeof login === 'string' && /^[a-zA-Z0-9._-]{3,64}$/.test(login);
}
