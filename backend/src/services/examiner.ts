import { generateContent, Content } from '../lib/gemini';
import { EXAMINER_SYSTEM, REPORT_SYSTEM } from '../prompts/examiner';

export const MAX_QUESTIONS = 6;

export interface Turn {
  index: number;
  question: string;
  topic: string;
  questionType: string;
  answer?: string;
  responseMs?: number;
  correctness?: string;
  observed?: string;
  misconception?: string;
}

export interface ExaminerStep {
  evaluation: {
    correctness: string;
    observed: string;
    misconception: string;
  };
  nextAction: 'probe' | 'advance' | 'end';
  question: string;
  topic: string;
  questionType: string;
}

export interface Report {
  headline: string;
  strengths: string[];
  gaps: string[];
  misconceptions: string[];
  responseObservations: string;
  studyPlan: { topic: string; action: string; why: string }[];
  scoreOutOf10: number;
}

/**
 * Builds the multi-turn conversation sent to Gemini.
 *
 * The whole exchange is replayed on every turn, so the examiner's next
 * question genuinely depends on everything the student has said, not just
 * their last answer.
 */
function buildConversation(
  notes: string,
  materialTitle: string,
  turns: Turn[],
  latestAnswer?: { answer: string; responseMs: number }
): Content[] {
  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        {
          text: `Study notes for "${materialTitle}". Examine the student only on this material.\n\n---\n${notes}\n---\n\nQuestion limit for this session: ${MAX_QUESTIONS}. Begin with your first question.`,
        },
      ],
    },
  ];

  turns.forEach((turn, i) => {
    contents.push({
      role: 'model',
      parts: [
        {
          text: JSON.stringify({
            evaluation: {
              correctness: i === 0 ? 'no_answer' : turns[i - 1]?.correctness || 'no_answer',
              observed: i === 0 ? '' : turns[i - 1]?.observed || '',
              misconception: '',
            },
            nextAction: i === 0 ? 'advance' : 'advance',
            question: turn.question,
            topic: turn.topic,
            questionType: turn.questionType,
          }),
        },
      ],
    });

    if (turn.answer !== undefined) {
      contents.push({
        role: 'user',
        parts: [
          {
            text: `Student answer (question ${turn.index + 1} of ${MAX_QUESTIONS}, took ${Math.round(
              (turn.responseMs || 0) / 1000
            )} seconds):\n\n${turn.answer}`,
          },
        ],
      });
    }
  });

  if (latestAnswer) {
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Student answer (question ${turns.length} of ${MAX_QUESTIONS}, took ${Math.round(
            latestAnswer.responseMs / 1000
          )} seconds):\n\n${latestAnswer.answer}`,
        },
      ],
    });
  }

  return contents;
}

/** Asks the examiner for its opening question. */
export async function firstQuestion(
  notes: string,
  materialTitle: string
): Promise<ExaminerStep> {
  const raw = await generateContent({
    systemInstruction: EXAMINER_SYSTEM,
    json: true,
    temperature: 0.7,
    thinkingLevel: 'low',
    maxOutputTokens: 2048,
    contents: buildConversation(notes, materialTitle, []),
  });

  return normaliseStep(raw);
}

/** Evaluates the latest answer and produces the next question. */
export async function nextStep(
  notes: string,
  materialTitle: string,
  turns: Turn[],
  answer: string,
  responseMs: number
): Promise<ExaminerStep> {
  const contents = buildConversation(notes, materialTitle, turns.slice(0, -1));

  const last = turns[turns.length - 1];
  contents.push({
    role: 'model',
    parts: [
      {
        text: JSON.stringify({
          question: last.question,
          topic: last.topic,
          questionType: last.questionType,
        }),
      },
    ],
  });
  contents.push({
    role: 'user',
    parts: [
      {
        text: `Student answer (question ${turns.length} of ${MAX_QUESTIONS}, took ${Math.round(
          responseMs / 1000
        )} seconds):\n\n${answer}\n\n${
          turns.length >= MAX_QUESTIONS
            ? 'This was the final question. Set nextAction to "end".'
            : 'Evaluate this answer, then decide what to ask next.'
        }`,
      },
    ],
  });

  const raw = await generateContent({
    systemInstruction: EXAMINER_SYSTEM,
    json: true,
    temperature: 0.7,
    thinkingLevel: 'low',
    maxOutputTokens: 2048,
    contents,
  });

  return normaliseStep(raw);
}

/** Produces the end-of-session report from the full transcript. */
export async function buildReport(
  materialTitle: string,
  turns: Turn[]
): Promise<Report> {
  const transcript = turns
    .map(
      (t) =>
        `Q${t.index + 1} (${t.questionType}, topic: ${t.topic}): ${t.question}\n` +
        `Answer (${Math.round((t.responseMs || 0) / 1000)}s): ${t.answer || '[no answer]'}\n` +
        `Examiner judged: ${t.correctness || 'unknown'}${
          t.observed ? ` — ${t.observed}` : ''
        }`
    )
    .join('\n\n');

  const raw = await generateContent({
    systemInstruction: REPORT_SYSTEM,
    json: true,
    temperature: 0.4,
    thinkingLevel: 'medium',
    maxOutputTokens: 4096,
    contents: [
      {
        role: 'user',
        parts: [
          { text: `Material: ${materialTitle}\n\nTranscript:\n\n${transcript}` },
        ],
      },
    ],
  });

  const p = safeParse(raw);

  return {
    headline: String(p.headline || 'Session complete.'),
    strengths: toStringArray(p.strengths),
    gaps: toStringArray(p.gaps),
    misconceptions: toStringArray(p.misconceptions),
    responseObservations: String(p.responseObservations || ''),
    studyPlan: Array.isArray(p.studyPlan)
      ? p.studyPlan.slice(0, 8).map((s: any) => ({
          topic: String(s?.topic || ''),
          action: String(s?.action || ''),
          why: String(s?.why || ''),
        }))
      : [],
    scoreOutOf10: clampScore(p.scoreOutOf10),
  };
}

function normaliseStep(raw: string): ExaminerStep {
  const p = safeParse(raw);
  const action = ['probe', 'advance', 'end'].includes(p.nextAction)
    ? p.nextAction
    : 'advance';

  return {
    evaluation: {
      correctness: String(p?.evaluation?.correctness || 'no_answer'),
      observed: String(p?.evaluation?.observed || ''),
      misconception: String(p?.evaluation?.misconception || ''),
    },
    nextAction: action,
    question: String(p.question || '').trim(),
    topic: String(p.topic || '').slice(0, 120),
    questionType: String(p.questionType || 'recall'),
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

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 10);
}

function clampScore(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}
