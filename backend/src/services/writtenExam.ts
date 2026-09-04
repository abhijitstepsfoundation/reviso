import { generateContent, Content, Part } from '../lib/gemini';
import { PAPER_SYSTEM, GRADING_SYSTEM } from '../prompts/writtenExam';

export interface PaperQuestion {
  number: number;
  marks: number;
  text: string;
  topic: string;
  markingPoints: string[];
}

export interface Paper {
  title: string;
  durationMinutes: number;
  totalMarks: number;
  instructions: string;
  questions: PaperQuestion[];
}

export interface QuestionResult {
  number: number;
  awarded: number;
  outOf: number;
  studentAnswerSummary: string;
  whatWasRight: string;
  whatWasMissing: string;
  misconception: string;
}

export interface GradingResult {
  transcriptionNotes: string;
  scriptAppearance: 'handwritten' | 'printed' | 'mixed' | 'unclear';
  scriptAppearanceNote: string;
  perQuestion: QuestionResult[];
  totalAwarded: number;
  totalOutOf: number;
  headline: string;
  gaps: string[];
  studyPlan: { topic: string; action: string; why: string }[];
}

/** Sets a paper from the student's own material. */
export async function generatePaper(
  notes: string,
  materialTitle: string
): Promise<Paper> {
  const raw = await generateContent({
    systemInstruction: PAPER_SYSTEM,
    json: true,
    temperature: 0.8,
    thinkingLevel: 'medium',
    maxOutputTokens: 6144,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Set a written paper on "${materialTitle}".\n\nStudy notes:\n\n${notes}`,
          },
        ],
      },
    ],
  });

  const p = safeParse(raw);
  const questions: PaperQuestion[] = (Array.isArray(p.questions) ? p.questions : [])
    .slice(0, 8)
    .map((q: any, i: number) => ({
      number: Number(q?.number) || i + 1,
      marks: Math.max(1, Math.min(20, Number(q?.marks) || 2)),
      text: String(q?.text || '').trim(),
      topic: String(q?.topic || '').slice(0, 120),
      markingPoints: Array.isArray(q?.markingPoints)
        ? q.markingPoints.map((m: any) => String(m).trim()).filter(Boolean)
        : [],
    }))
    .filter((q: PaperQuestion) => q.text);

  if (questions.length === 0) {
    throw new Error('The paper could not be set. Please try again.');
  }

  return {
    title: String(p.title || materialTitle).slice(0, 140),
    durationMinutes: Math.max(5, Math.min(180, Number(p.durationMinutes) || 30)),
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    instructions: String(p.instructions || 'Answer all questions.'),
    questions,
  };
}

/**
 * Marks photographed handwritten answers against the paper's own rubric.
 * The images are sent inline alongside the paper and the source notes.
 */
export async function gradeAnswers(
  paper: Paper,
  notes: string,
  pages: { mimeType: string; buffer: Buffer }[]
): Promise<GradingResult> {
  const parts: Part[] = [
    {
      text:
        `Question paper (with marking points, for your use only):\n\n` +
        JSON.stringify(paper.questions, null, 2) +
        `\n\nStudy notes the paper was set from:\n\n${notes}` +
        `\n\nThe student's handwritten script follows as ${pages.length} image${
          pages.length === 1 ? '' : 's'
        }, in page order.`,
    },
  ];

  pages.forEach((page) => {
    parts.push({
      inlineData: { mimeType: page.mimeType, data: page.buffer.toString('base64') },
    });
  });

  parts.push({ text: 'Mark this script now.' });

  const contents: Content[] = [{ role: 'user', parts }];

  const raw = await generateContent({
    systemInstruction: GRADING_SYSTEM,
    json: true,
    temperature: 0.2,
    thinkingLevel: 'medium',
    maxOutputTokens: 8192,
    contents,
  });

  const p = safeParse(raw);

  const perQuestion: QuestionResult[] = (Array.isArray(p.perQuestion) ? p.perQuestion : [])
    .map((q: any) => {
      const paperQ = paper.questions.find((x) => x.number === Number(q?.number));
      const outOf = paperQ?.marks ?? Math.max(0, Number(q?.outOf) || 0);
      return {
        number: Number(q?.number) || 0,
        awarded: Math.max(0, Math.min(outOf, Number(q?.awarded) || 0)),
        outOf,
        studentAnswerSummary: String(q?.studentAnswerSummary || ''),
        whatWasRight: String(q?.whatWasRight || ''),
        whatWasMissing: String(q?.whatWasMissing || ''),
        misconception: String(q?.misconception || ''),
      };
    })
    .filter((q: QuestionResult) => q.number > 0);

  // Totals are recomputed rather than trusted, so the arithmetic is always right.
  const totalAwarded = perQuestion.reduce((s, q) => s + q.awarded, 0);

  const appearance = ['handwritten', 'printed', 'mixed', 'unclear'].includes(
    p.scriptAppearance
  )
    ? p.scriptAppearance
    : 'unclear';

  return {
    transcriptionNotes: String(p.transcriptionNotes || ''),
    scriptAppearance: appearance,
    scriptAppearanceNote: String(p.scriptAppearanceNote || ''),
    perQuestion,
    totalAwarded,
    totalOutOf: paper.totalMarks,
    headline: String(p.headline || 'Script marked.'),
    gaps: Array.isArray(p.gaps)
      ? p.gaps.map((g: any) => String(g).trim()).filter(Boolean).slice(0, 10)
      : [],
    studyPlan: Array.isArray(p.studyPlan)
      ? p.studyPlan.slice(0, 8).map((s: any) => ({
          topic: String(s?.topic || ''),
          action: String(s?.action || ''),
          why: String(s?.why || ''),
        }))
      : [],
  };
}

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
    throw new Error('The examiner response could not be read. Please try again.');
  }
}
