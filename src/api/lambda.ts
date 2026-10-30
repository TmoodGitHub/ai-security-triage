import awsLambdaFastify from '@fastify/aws-lambda';
import {
  GetParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { buildApp } from './app.js';
import { db } from '../db/client.js';
import { createVerifier } from '../auth/tokens.js';

const parameterName = process.env.JWT_SECRET_PARAMETER;
if (parameterName === undefined || parameterName === '') {
  throw new Error(
    'Missing environment variable: JWT_SECRET_PARAMETER',
  );
}

const { Parameter } = await new SSMClient({}).send(
  new GetParameterCommand({
    Name: parameterName,
    WithDecryption: true,
  }),
);

const secret = Parameter?.Value;
if (secret === undefined || secret.length < 32) {
  throw new Error(
    `${parameterName} must hold a secret of at least 32 characters`,
  );
}

const app = buildApp({
  db,
  verify: createVerifier(secret),
});

export const handler = awsLambdaFastify(app, {
  pathParameterUsedAsPath: 'proxy',
});

await app.ready();
