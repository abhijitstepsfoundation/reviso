import { generateContent } from '../lib/gemini';
import { PROFILE_SYSTEM } from '../prompts/profile';

export interface TopicNote {
  topic: string;
  evidence: string;
}

export interface Misconception {
  pattern: string;
  evidence: string;
}

export interface LearningProfile {
  headline: string;
  strengths: TopicNote[];
  weaknesses: TopicNote[];
  misconceptions: Misconception[];
  modalityComparison: string;
  trend: string;
  trendNote: string;
  studyPlan: { topic: string; action: string; why: string }[];
  evidenceNote: string;
  evidenceBase: {
    oralSessions: number;
    writtenExams: number;
    questionsAnswered: number;
  };
}

export interface AssessmentDigest {
  oral: string[];
  written: string[];
  oralCount: number;
  writtenCount: number;
  questionsAnswered: number;
}

/**
 * Turns raw session and exam documents into a compact text digest.
 * Sending summaries rather than full transcripts keeps the prompt small
 * enough to stay fast as a student's history grows.
 */
export function buildDigest(
  sessions: any[],
  exams: any[]
): AssessmentDigest {
  let questionsAnswered = 0;

  const oral = sessions.map((s) => {
    const turns = s.turns || [];
    questionsAnswered += turns.length;

    const perTurn = turns
      .map(
        (t: any) =>
          `  - [${t.topic || 'untitled'}] ${t.questionType}: judged ${
            t.correctness || 'unknown'
          }, ${Math.round((t.responseMs || 0) / 1000)}s${
            t.observed ? ` — ${t.observed}` : ''
          }${t.misconception ? ` (misconception flagged: ${t.misconception})` : ''}`
      )
      .join('\n');

    const r = s.report || {};
    return (
      `ORAL VIVA on "${s.materialTitle}" (${s.createdAt || 'undated'})\n` +
      `Score: ${r.scoreOutOf10 ?? '?'}/10. ${r.headline || ''}\n` +
      `Strengths: ${(r.strengths || []).join('; ') || 'none recorded'}\n` +
      `Gaps: ${(r.gaps || []).join('; ') || 'none recorded'}\n` +
      `Misconceptions: ${(r.misconceptions || []).join('; ') || 'none'}\n` +
      `Turns:\n${perTurn}`
    );
  });

  const written = exams.map((e) => {
    const r = e.result || {};
    questionsAnswered += (r.perQuestion || []).length;

    const perQ = (r.perQuestion || [])
      .map(
        (q: any) =>
          `  - Q${q.number}: ${q.awarded}/${q.outOf}${
            q.whatWasMissing ? ` — missing: ${q.whatWasMissing}` : ''
          }${q.misconception ? ` (faulty reasoning: ${q.misconception})` : ''}`
      )
      .join('\n');

    return (
      `WRITTEN PAPER "${e.paper?.title || e.materialTitle}" (${e.createdAt || 'undated'})\n` +
      `Score: ${r.totalAwarded ?? '?'}/${r.totalOutOf ?? '?'}. ${r.headline || ''}\n` +
      `Script was ${r.scriptAppearance || 'unclear'}.\n` +
      `Gaps: ${(r.gaps || []).join('; ') || 'none recorded'}\n` +
      `Questions:\n${perQ}`
    );
  });

  return {
    oral,
    written,
    oralCount: oral.length,
    writtenCount: written.length,
    questionsAnswered,
  };
}

/** Builds the cross-modal learning profile from the digest. */
export async function buildProfile(
  digest: AssessmentDigest
): Promise<LearningProfile> {
  const body =
    `This student has completed ${digest.oralCount} oral viva${
      digest.oralCount === 1 ? '' : 's'
    } and ${digest.writtenCount} written paper${
      digest.writtenCount === 1 ? '' : 's'
    }.\n\n` +
    [...digest.oral, ...digest.written].join('\n\n---\n\n');

  const raw = await generateContent({
    systemInstruction: PROFILE_SYSTEM,
    json: true,
    temperature: 0.3,
    thinkingLevel: 'medium',
    maxOutputTokens: 6144,
    contents: [{ role: 'user', parts: [{ text: body }] }],
  });

  const p = safeParse(raw);

  return {
    headline: String(p.headline || 'Not enough assessments yet.'),
    strengths: toNotes(p.strengths),
    weaknesses: toNotes(p.weaknesses),
    misconceptions: Array.isArray(p.misconceptions)
      ? p.misconceptions
          .slice(0, 8)
          .map((m: any) => ({
            pattern: String(m?.pattern || '').trim(),
            evidence: String(m?.evidence || '').trim(),
          }))
          .filter((m: Misconception) => m.pattern)
      : [],
    modalityComparison: String(p.modalityComparison || ''),
    trend: ['improving', 'steady', 'declining', 'insufficient_data'].includes(p.trend)
      ? p.trend
      : 'insufficient_data',
    trendNote: String(p.trendNote || ''),
    studyPlan: Array.isArray(p.studyPlan)
      ? p.studyPlan.slice(0, 6).map((s: any) => ({
          topic: String(s?.topic || ''),
          action: String(s?.action || ''),
          why: String(s?.why || ''),
        }))
      : [],
    evidenceNote: String(p.evidenceNote || ''),
    evidenceBase: {
      oralSessions: digest.oralCount,
      writtenExams: digest.writtenCount,
      questionsAnswered: digest.questionsAnswered,
    },
  };
}

function toNotes(v: unknown): TopicNote[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 8)
    .map((x: any) => ({
      topic: String(x?.topic || '').trim(),
      evidence: String(x?.evidence || '').trim(),
    }))
    .filter((x) => x.topic);
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
    throw new Error('The profile could not be read. Please try again.');
  }
}
