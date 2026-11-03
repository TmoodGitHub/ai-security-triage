import awsLambdaFastify from '@fastify/aws-lambda';
import { buildApp } from './app.js';
import { db } from '../db/client.js';
import { createCognitoVerifier } from '../auth/cognito.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }
  return value;
}

const app = buildApp({
  db,
  verify: createCognitoVerifier({
    region: requireEnv('AWS_REGION'),
    userPoolId: requireEnv('COGNITO_USER_POOL_ID'),
    clientId: requireEnv('COGNITO_CLIENT_ID'),
  }),
});

export const handler = awsLambdaFastify(app, {
  pathParameterUsedAsPath: 'proxy',
});

await app.ready();
