import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCognitoVerifier } from '../src/auth/cognito.js';

const REGION = 'us-east-1';
const POOL_ID = 'us-east-1_TestPool';
const CLIENT_ID = 'test-client-id';
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`;

let privateKey: CryptoKey;
let verify: ReturnType<typeof createCognitoVerifier>;

async function cognitoToken(
  overrides: JWTPayload = {},
  key: CryptoKey = privateKey,
): Promise<string> {
  return new SignJWT({
    token_use: 'id',
    email: 'analyst@example.com',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('7c1e-test-sub')
    .setIssuer((overrides.iss as string) ?? ISSUER)
    .setAudience((overrides.aud as string) ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime((overrides.exp as number) ?? '1h')
    .sign(key);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'test-key',
    alg: 'RS256',
  };
  verify = createCognitoVerifier({
    region: REGION,
    userPoolId: POOL_ID,
    clientId: CLIENT_ID,
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
});

describe('createCognitoVerifier', () => {
  it('accepts an ID token from the pool and identifies the user by email', async () => {
    expect(await verify(await cognitoToken())).toEqual({
      subject: 'analyst@example.com',
      name: 'analyst@example.com',
    });
  });

  it('rejects an access token', async () => {
    await expect(
      verify(await cognitoToken({ token_use: 'access' })),
    ).rejects.toThrow('Expected a Cognito ID token');
  });

  it('rejects a token for a different app', async () => {
    await expect(
      verify(await cognitoToken({ aud: 'other-client' })),
    ).rejects.toThrow();
  });

  it('rejects a token from a different user pool', async () => {
    await expect(
      verify(
        await cognitoToken({
          iss: `https://cognito-idp.${REGION}.amazonaws.com/us-east-1_Other`,
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600;
    await expect(
      verify(await cognitoToken({ exp: anHourAgo })),
    ).rejects.toThrow();
  });

  it('rejects a token signed with a different key', async () => {
    const other = await generateKeyPair('RS256');
    await expect(
      verify(await cognitoToken({}, other.privateKey)),
    ).rejects.toThrow();
  });
});
