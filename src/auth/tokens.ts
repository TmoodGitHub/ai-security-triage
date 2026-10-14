import { SignJWT, jwtVerify } from 'jose';

export const ISSUER = 'ai-security-triage';
export const AUDIENCE = 'findings-api';

export interface AuthUser {
  subject: string;
  name: string | null;
}

export async function createToken(
  secret: string,
  subject: string,
  name: string | null,
  expiresIn = '8h',
): Promise<string> {
  return new SignJWT(name ? { name } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

export function createVerifier(secret: string) {
  const key = new TextEncoder().encode(secret);

  return async function verify(
    token: string,
  ): Promise<AuthUser> {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      requiredClaims: ['sub', 'exp'],
    });
    return {
      subject: payload.sub as string,
      name:
        typeof payload.name === 'string'
          ? payload.name
          : null,
    };
  };
}

export type Verifier = ReturnType<typeof createVerifier>;
