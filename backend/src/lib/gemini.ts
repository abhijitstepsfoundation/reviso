import { getGeminiApiKey } from './secrets';
import { config } from '../config';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type Content = { role: 'user' | 'model'; parts: Part[] };

/**
 * Gemini 3 reasoning depth. Support varies by model: some flash models
 * accept only 'low' and 'high', so anything narrower is risky.
 */
export type ThinkingLevel = 'low' | 'medium' | 'high';

/** Carries the model's finishReason so callers can react to it. */
export interface GeminiError extends Error {
  status?: number;
  finishReason?: string;
}

interface GenerateOptions {
  contents: Content[];
  systemInstruction?: string;
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: ThinkingLevel;
}

function fail(message: string, status?: number, finishReason?: string): never {
  const err = new Error(message) as GeminiError;
  if (status) err.status = status;
  if (finishReason) err.finishReason = finishReason;
  throw err;
}

function buildBody(opts: GenerateOptions, includeThinking: boolean) {
  const body: Record<string, unknown> = {
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      // Always set a ceiling. Without one, a long document can consume the
      // whole default budget on reasoning and come back with no text at all.
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      ...(includeThinking
        ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel ?? 'low' } }
        : {}),
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  return body;
}

/**
 * Calls Gemini generateContent. The API key is fetched from Secret Manager
 * on the server and sent as a header, never placed in a URL or logged.
 */
export async function generateContent(opts: GenerateOptions): Promise<string> {
  const key = await getGeminiApiKey();
  const url = `${BASE}/models/${config.geminiModel}:generateContent`;

  const send = (includeThinking: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(buildBody(opts, includeThinking)),
    });

  let res = await send(true);

  // Thinking-level support differs between models. If this model rejects the
  // setting, fall back to its default rather than failing the whole request.
  if (res.status === 400) {
    const detail = await res.clone().text();
    if (/thinking/i.test(detail)) {
      console.warn('Model rejected thinking config; retrying with defaults.');
      res = await send(false);
    }
  }

  if (!res.ok) {
    const detail = await res.text();
    console.error('Gemini API error', res.status, detail.slice(0, 500));
    fail(`Gemini request failed with status ${res.status}`);
  }

  const data: any = await res.json();

  // The whole prompt was rejected before generation started.
  if (data?.promptFeedback?.blockReason) {
    fail(
      'That content could not be processed. Please try another file.',
      400,
      data.promptFeedback.blockReason
    );
  }

  const candidate = data?.candidates?.[0];
  const finish = candidate?.finishReason;

  const text = candidate?.content?.parts
    ?.map((p: any) => p.text ?? '')
    .join('')
    .trim();

  if (!text) {
    console.error('Empty Gemini response', {
      finishReason: finish,
      usage: data?.usageMetadata,
    });

    if (finish === 'MAX_TOKENS') {
      fail(
        'That document is too long to process in one go. Try uploading a single chapter or section.',
        400,
        finish
      );
    }
    if (finish === 'RECITATION') {
      // The model declined to output text that would closely copy a
      // copyrighted source. Callers may retry with a rephrasing prompt.
      fail(
        'Reviso could not process that material without copying it too closely. Try a different chapter, or your own notes.',
        400,
        finish
      );
    }
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') {
      fail(
        'That content could not be processed. Please try another file.',
        400,
        finish
      );
    }
    fail('Gemini returned an empty response', undefined, finish);
  }

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
