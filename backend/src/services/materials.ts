import { generateContent, GeminiError } from '../lib/gemini';
import { EXTRACTION_SYSTEM, ANALYSIS_SYSTEM } from '../prompts/materialAnalysis';

export interface MaterialAnalysis {
  title: string;
  subject: string;
  summary: string;
  topics: string[];
  keyConcepts: string[];
  examinable: boolean;
}

/** Keeps a Firestore document comfortably under the 1 MiB limit. */
const MAX_EXTRACT_CHARS = 40000;

const EXTRACT_INSTRUCTION =
  'Produce structured study notes covering this material, written in your own words.';

const REPHRASE_INSTRUCTION =
  'Produce structured study notes covering this material. Rewrite every ' +
  'explanation completely in your own words and do not follow the source ' +
  'sentence structure. Keep only technical terms, formulas and numbers as ' +
  'they appear.';

/**
 * Step 1: turn the upload into structured study notes.
 *
 * The notes are written in the model's own words rather than transcribed.
 * Published material triggers Gemini's recitation filter when asked for a
 * faithful copy, which returns no text at all.
 */
export async function extractStudyText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const call = (instruction: string, temperature: number) =>
    generateContent({
      systemInstruction: EXTRACTION_SYSTEM,
      temperature,
      thinkingLevel: 'low',
      maxOutputTokens: 32768,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: buffer.toString('base64') } },
            { text: instruction },
          ],
        },
      ],
    });

  let text: string;
  try {
    text = await call(EXTRACT_INSTRUCTION, 0.3);
  } catch (err) {
    // Recitation is probabilistic. One retry with a stronger rephrasing
    // instruction clears it in most cases.
    if ((err as GeminiError)?.finishReason === 'RECITATION') {
      console.warn('Recitation block on first pass; retrying with rephrasing.');
      text = await call(REPHRASE_INSTRUCTION, 0.6);
    } else {
      throw err;
    }
  }

  if (text.trim() === 'NO_ACADEMIC_CONTENT') {
    throw Object.assign(
      new Error('That file does not appear to contain study material.'),
      { status: 400 }
    );
  }

  return text.slice(0, MAX_EXTRACT_CHARS);
}

/** Step 2: summarise and identify examinable topics from the notes. */
export async function analyseStudyText(
  extractedText: string
): Promise<MaterialAnalysis> {
  const raw = await generateContent({
    systemInstruction: ANALYSIS_SYSTEM,
    json: true,
    temperature: 0.3,
    thinkingLevel: 'low',
    maxOutputTokens: 4096,
    contents: [{ role: 'user', parts: [{ text: extractedText }] }],
  });

  const parsed = safeParse(raw);

  return {
    title: String(parsed.title || 'Untitled material').slice(0, 120),
    subject: String(parsed.subject || ''),
    summary: String(parsed.summary || ''),
    topics: toStringArray(parsed.topics).slice(0, 12),
    keyConcepts: toStringArray(parsed.keyConcepts).slice(0, 20),
    examinable: parsed.examinable !== false,
  };
}

/** Model output is untrusted data, so parsing never throws into the route. */
function safeParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    throw new Error('Could not read the analysis. Please try uploading again.');
  }
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}
