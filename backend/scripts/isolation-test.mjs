/**
 * Cross-user isolation proof for Reviso.
 *
 * Creates two throwaway test accounts, plants a document under one of them,
 * then verifies that the other account cannot read, modify, delete or
 * otherwise reach it through the public API. Also checks that unauthenticated
 * and forged requests are rejected.
 *
 * Usage, from the backend/ directory:
 *   node scripts/isolation-test.mjs https://your-service.run.app
 *
 * Requires application default credentials:
 *   gcloud auth application-default login
 *
 * No Gemini calls are made, so running this costs nothing.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '');
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'gen-ai-academy-apac-506308';
const WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || 'AIzaSyD_hS8jJY1LROZqfyn1ecv7re1zXu-fjF0';

/**
 * Custom tokens must be cryptographically signed, and a user credential
 * cannot sign. Naming a service account lets the Admin SDK sign through the
 * IAM Credentials API using your own permissions, so no private key file is
 * ever downloaded to this machine.
 */
const SERVICE_ACCOUNT_ID =
  process.env.SERVICE_ACCOUNT_ID ||
  '903171002994-compute@developer.gserviceaccount.com';

const UID_A = 'isolation-test-user-a';
const UID_B = 'isolation-test-user-b';

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
    serviceAccountId: SERVICE_ACCOUNT_ID,
  });
}

const auth = getAuth();
const db = getFirestore();

const results = [];

function record(name, expected, actual, extra = '') {
  const pass = expected.includes(actual);
  results.push({ name, expected: expected.join(' or '), actual, pass, extra });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}`);
  console.log(`         expected ${expected.join(' or ')}, got ${actual}${extra ? ` — ${extra}` : ''}`);
}

/** Exchanges a custom token for a real Firebase ID token. */
async function idTokenFor(uid) {
  let customToken;
  try {
    customToken = await auth.createCustomToken(uid);
  } catch (err) {
    if (/service account|signBlob|ENOTFOUND/i.test(err.message)) {
      throw new Error(
        'Cannot sign custom tokens with a user credential.\n\n' +
          'Grant your account permission to sign as the service account:\n\n' +
          `  gcloud services enable iamcredentials.googleapis.com --project ${PROJECT_ID}\n` +
          `  gcloud iam service-accounts add-iam-policy-binding ${SERVICE_ACCOUNT_ID} \\\n` +
          '    --member="user:YOUR_EMAIL" \\\n' +
          '    --role="roles/iam.serviceAccountTokenCreator" \\\n' +
          `    --project ${PROJECT_ID}\n\n` +
          'Then re-run. Role changes can take a minute to propagate.\n\n' +
          `Original error: ${err.message}`
      );
    }
    throw err;
  }
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  if (!res.ok) {
    throw new Error(`Token exchange failed for ${uid}: ${await res.text()}`);
  }
  return (await res.json()).idToken;
}

async function call(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.status;
}

async function main() {
  console.log(`\nReviso cross-user isolation test`);
  console.log(`Target: ${BASE}`);
  console.log(`Project: ${PROJECT_ID}\n`);

  console.log('Setting up two test accounts...');
  const [tokenA, tokenB] = await Promise.all([idTokenFor(UID_A), idTokenFor(UID_B)]);

  // Plant a material under user B, directly via the Admin SDK.
  const bMaterial = db.collection('users').doc(UID_B).collection('materials').doc();
  await bMaterial.set({
    title: 'User B private material',
    fileName: 'b-private.pdf',
    mimeType: 'application/pdf',
    status: 'ready',
    extractedText: 'Confidential notes belonging to user B.',
    storagePath: `users/${UID_B}/materials/${bMaterial.id}/source.pdf`,
    createdAt: new Date(),
  });

  const bSession = db.collection('users').doc(UID_B).collection('sessions').doc();
  await bSession.set({
    materialId: bMaterial.id,
    materialTitle: 'User B private material',
    mode: 'oral',
    status: 'completed',
    turns: [],
    report: { headline: 'Private report for user B', scoreOutOf10: 9 },
    createdAt: new Date(),
  });

  console.log(`Planted material ${bMaterial.id} and session ${bSession.id} under user B.\n`);

  console.log('Authentication boundary');
  record('No token is rejected', [401], await call('/me'));
  record('Malformed token is rejected', [401], await call('/me', { token: 'not-a-real-token' }));
  record(
    'Token with tampered payload is rejected',
    [401],
    await call('/me', { token: tokenA.slice(0, -6) + 'AAAAAA' })
  );

  console.log('\nOwnership boundary');
  record('User A can read their own profile', [200], await call('/me', { token: tokenA }));
  record(
    "User A cannot read user B's material",
    [403, 404],
    await call(`/materials/${bMaterial.id}`, { token: tokenA })
  );
  record(
    "User A cannot read user B's session",
    [403, 404],
    await call(`/sessions/${bSession.id}`, { token: tokenA })
  );
  record(
    "User A cannot delete user B's material",
    [403, 404],
    await call(`/materials/${bMaterial.id}`, { token: tokenA, method: 'DELETE' })
  );
  record(
    "User A cannot start a session on user B's material",
    [400, 403, 404],
    await call('/sessions', { token: tokenA, method: 'POST', body: { materialId: bMaterial.id } })
  );
  record(
    "User A cannot set a paper on user B's material",
    [400, 403, 404],
    await call('/exams', { token: tokenA, method: 'POST', body: { materialId: bMaterial.id } })
  );

  console.log('\nNo leakage through list endpoints');
  const listRes = await fetch(`${BASE}/api/materials`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const listed = listRes.ok ? await listRes.json() : [];
  const leaked = Array.isArray(listed) && listed.some((m) => m.id === bMaterial.id);
  record(
    "User B's material does not appear in user A's list",
    [200],
    listRes.status,
    leaked ? 'LEAKED — id present in response' : `${listed.length} items, none belonging to B`
  );
  if (leaked) results[results.length - 1].pass = false;

  console.log('\nUser B still has their data');
  const still = await bMaterial.get();
  record(
    "User B's material survived user A's delete attempt",
    [200],
    still.exists ? 200 : 404
  );

  console.log('\nCleaning up...');
  await db.recursiveDelete(db.collection('users').doc(UID_A));
  await db.recursiveDelete(db.collection('users').doc(UID_B));
  await Promise.all([
    auth.deleteUser(UID_A).catch(() => {}),
    auth.deleteUser(UID_B).catch(() => {}),
  ]);

  const failed = results.filter((r) => !r.pass);
  console.log('\n' + '='.repeat(60));
  console.log(`${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('\nFAILED:');
    failed.forEach((f) => console.log(`  - ${f.name} (got ${f.actual})`));
    process.exit(1);
  }
  console.log('Cross-user isolation verified.');
  console.log('='.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('\nTest run failed:', err.message);
  process.exit(1);
});
