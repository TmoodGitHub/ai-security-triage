import {
  createToken,
  createVerifier,
} from '../src/auth/tokens';

const TEST_SECRET =
  'test-secret-that-is-at-least-32-characters-long';

export const verify = createVerifier(TEST_SECRET);

export async function authHeaders(
  subject = 'test-analyst',
): Promise<{ authorization: string }> {
  const token = await createToken(
    TEST_SECRET,
    subject,
    null,
  );
  return { authorization: `Bearer ${token}` };
}
