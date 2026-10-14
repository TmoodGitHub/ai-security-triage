import { SignJWT } from 'jose';
import { describe, it, expect } from 'vitest';
import {
  AUDIENCE,
  ISSUER,
  createToken,
  createVerifier,
} from '../src/auth/tokens.ts';

const SECRET =
  'test-secret-that-is-at-least-32-characters-long';
const verify = createVerifier(SECRET);

describe('tokens', () => {
  it('accepts a token it created and reads who it belongs to', async () => {
    const token = await createToken(
      SECRET,
      'analyst-1',
      'Alice',
    );

    expect(await verify(token)).toEqual({
      subject: 'analyst-1',
      name: 'Alice',
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await createToken(
      'a-completely-different-secret-of-32-plus-characters',
      'analyst-1',
      null,
    );

    await expect(verify(token)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('analyst-1')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET));

    await expect(verify(token)).rejects.toThrow();
  });

  it('rejects text that is not a token', async () => {
    await expect(verify('not-a-token')).rejects.toThrow();
  });
});
