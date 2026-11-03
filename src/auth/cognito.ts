import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import type { AuthUser } from './tokens.js';

export const REVIEWER_GROUP = 'reviewers';

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  keys?: JWTVerifyGetKey;
}

export function createCognitoVerifier(
  config: CognitoConfig,
) {
  const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
  const keys =
    config.keys ??
    createRemoteJWKSet(
      new URL(`${issuer}/.well-known/jwks.json`),
    );

  return async function verify(
    token: string,
  ): Promise<AuthUser> {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: config.clientId,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'email'],
    });
    if (payload.token_use !== 'id') {
      throw new Error('Expected a Cognito ID token');
    }
    const groups = payload['cognito:groups'];
    return {
      subject: payload.email as string,
      name: payload.email as string,
      canReview:
        Array.isArray(groups) &&
        groups.includes(REVIEWER_GROUP),
    };
  };
}
