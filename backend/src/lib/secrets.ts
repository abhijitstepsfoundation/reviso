import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { config } from '../config';

const client = new SecretManagerServiceClient();
let cachedKey: string | null = null;

/**
 * Reads the Gemini API key from Google Cloud Secret Manager.
 * The key is never stored in source, in Firestore, or sent to the browser.
 */
export async function getGeminiApiKey(): Promise<string> {
  if (cachedKey) return cachedKey;

  const name = `projects/${config.projectId}/secrets/${config.geminiSecretName}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data?.toString();

  if (!payload) {
    throw new Error('Gemini API key secret is empty or unreadable');
  }

  cachedKey = payload.trim();
  return cachedKey;
}
