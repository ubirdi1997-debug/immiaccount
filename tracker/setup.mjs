import { createInterface } from 'node:readline/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { readStore, writeStore, hashPassword, validLogin, validPassword } from './store.mjs';

const db = readStore();
if (db.accounts.some(a => a.role === 'admin')) {
  console.error('An admin already exists. Sign in with that account.');
  process.exit(1);
}
let login = process.env.TRACKER_ADMIN_ID;
if (!login) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  login = (await prompt.question('Admin login ID (3–64 letters, numbers, dots, underscores or hyphens): ')).trim();
  prompt.close();
}
const generated = !process.env.TRACKER_ADMIN_PASSWORD;
const password = process.env.TRACKER_ADMIN_PASSWORD || randomBytes(18).toString('base64url');
if (!validLogin(login) || !validPassword(password)) {
  console.error('Invalid ID or password. Passwords must contain 12–128 characters.');
  process.exit(1);
}
db.accounts.push({ id: randomUUID(), login, role: 'admin', passwordHash: hashPassword(password) });
writeStore(db);
console.log(`Admin created: ${login}`);
if (generated) console.log(`Generated password (save this now): ${password}`);
console.log('Run npm start, then open http://127.0.0.1:3000');
