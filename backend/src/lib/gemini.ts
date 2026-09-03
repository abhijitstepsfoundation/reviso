import { getGeminiApiKey } from './secrets';
import { config } from '../config';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type Content = { role: 'user' | 'model'; parts: Part[] };

interface GenerateOptions {
  contents: Content[];
  systemInstruction?: string;
  json?: boolean;
  temperature?: number;
}

/**
 * Calls Gemini generateContent. The API key is fetched from Secret Manager
 * on the server and sent as a header, never placed in a URL or logged.
 */
export async function generateContent(opts: GenerateOptions): Promise<string> {
  const key = await getGeminiApiKey();

  const body: Record<string, unknown> = {
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  const res = await fetch(`${BASE}/models/${config.geminiModel}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('Gemini API error', res.status, detail.slice(0, 500));
    throw new Error(`Gemini request failed with status ${res.status}`);
  }

  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text ?? '')
    .join('')
    .trim();

  if (!text) throw new Error('Gemini returned an empty response');
  return text;
}

/** Lists the models this API key can actually use. Used for diagnostics. */
export async function listModels(): Promise<string[]> {
  const key = await getGeminiApiKey();
  const res = await fetch(`${BASE}/models`, {
    headers: { 'x-goog-api-key': key },
  });
  if (!res.ok) throw new Error(`Model list failed with status ${res.status}`);
  const data: any = await res.json();
  return (data.models || [])
    .filter((m: any) =>
      (m.supportedGenerationMethods || []).includes('generateContent')
    )
    .map((m: any) => String(m.name).replace('models/', ''));
}
