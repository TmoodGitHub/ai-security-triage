import { createToken } from './tokens.js';

const subject = process.argv[2];
const name = process.argv[3] ?? null;
const secret = process.env.JWT_SECRET;

if (subject === undefined) {
  console.error(
    'Usage: npm run token -- <subject> ["Display Name"]',
  );
  process.exit(1);
}

if (secret === undefined) {
  console.error(
    'JWT_SECRET must be set in .env and be at least 32 characters',
  );
  process.exit(1);
}

console.log(await createToken(secret, subject, name));
