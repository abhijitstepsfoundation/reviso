import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth, asyncHandler } from '../middleware/auth';
import { db } from '../lib/firebase';
import {
  firstQuestion,
  nextStep,
  buildReport,
  MAX_QUESTIONS,
  Turn,
} from '../services/examiner';

const router = Router();

function param(v: unknown): string {
  return Array.isArray(v) ? String(v[0]) : String(v ?? '');
}

const userDoc = (uid: string) => db.collection('users').doc(uid);

/** List the signed-in user's own sessions, newest first. */
router.get(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await userDoc(req.uid!)
      .collection('sessions')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    res.json(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          materialTitle: data.materialTitle,
          mode: data.mode,
          status: data.status,
          questionsAsked: (data.turns || []).length,
          scoreOutOf10: data.report?.scoreOutOf10 ?? null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      })
    );
  })
);

/** Fetch one session, including its transcript and report. */
router.get(
  '/sessions/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await userDoc(req.uid!)
      .collection('sessions')
      .doc(param(req.params.id))
      .get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const data = doc.data()!;
    res.json({
      id: doc.id,
      materialTitle: data.materialTitle,
      mode: data.mode,
      status: data.status,
      turns: data.turns || [],
      report: data.report || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    });
  })
);

/**
 * Start an oral examination on one of the user's own materials.
 * The material is read from the caller's own subtree, so a session can
 * never be started against another user's document.
 */
router.post(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.uid!;
    const materialId = String(req.body?.materialId || '');

    if (!materialId) {
      res.status(400).json({ error: 'Choose a material to be examined on.' });
      return;
    }

    const matDoc = await userDoc(uid).collection('materials').doc(materialId).get();
    if (!matDoc.exists) {
      res.status(404).json({ error: 'Material not found' });
      return;
    }

    const mat = matDoc.data()!;
    if (mat.status !== 'ready' || !mat.extractedText) {
      res.status(400).json({ error: 'That material is not ready to be examined yet.' });
      return;
    }

    const step = await firstQuestion(mat.extractedText, mat.title || 'your material');
    if (!step.question) {
      res.status(500).json({ error: 'The examiner could not start. Please try again.' });
      return;
    }

    const turn: Turn = {
      index: 0,
      question: step.question,
      topic: step.topic,
      questionType: step.questionType,
    };

    const ref = userDoc(uid).collection('sessions').doc();
    await ref.set({
      materialId,
      materialTitle: mat.title || 'Untitled material',
      mode: 'oral',
      status: 'active',
      turns: [turn],
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({
      sessionId: ref.id,
      materialTitle: mat.title,
      question: step.question,
      topic: step.topic,
      questionType: step.questionType,
      index: 0,
      total: MAX_QUESTIONS,
    });
  })
);

/**
 * Submit an answer. Returns either the next question or the final report.
 * responseMs is measured in the browser and treated as an observation only.
 */
router.post(
  '/sessions/:id/answer',
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.uid!;
    const sessionId = param(req.params.id);
    const answer = String(req.body?.answer ?? '').slice(0, 5000);
    const responseMs = Math.max(0, Math.min(3600000, Number(req.body?.responseMs) || 0));

    const ref = userDoc(uid).collection('sessions').doc(sessionId);
    const doc = await ref.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const data = doc.data()!;
    if (data.status !== 'active') {
      res.status(400).json({ error: 'This session has already finished.' });
      return;
    }

    const turns: Turn[] = data.turns || [];
    if (turns.length === 0) {
      res.status(400).json({ error: 'This session has no question to answer.' });
      return;
    }

    const matDoc = await userDoc(uid).collection('materials').doc(data.materialId).get();
    const notes = matDoc.data()?.extractedText;
    if (!notes) {
      res.status(400).json({ error: 'The material for this session is no longer available.' });
      return;
    }

    const step = await nextStep(
      notes,
      data.materialTitle,
      turns,
      answer,
      responseMs
    );

    // Record the answer and the examiner's judgement on the open turn.
    const updated = [...turns];
    updated[updated.length - 1] = {
      ...updated[updated.length - 1],
      answer,
      responseMs,
      correctness: step.evaluation.correctness,
      observed: step.evaluation.observed,
      misconception: step.evaluation.misconception,
    };

    const limitReached = updated.length >= MAX_QUESTIONS;
    const finished = step.nextAction === 'end' || limitReached || !step.question;

    if (!finished) {
      updated.push({
        index: updated.length,
        question: step.question,
        topic: step.topic,
        questionType: step.questionType,
      });

      await ref.update({ turns: updated });

      res.json({
        done: false,
        question: step.question,
        topic: step.topic,
        questionType: step.questionType,
        nextAction: step.nextAction,
        index: updated.length - 1,
        total: MAX_QUESTIONS,
      });
      return;
    }

    const report = await buildReport(data.materialTitle, updated);

    await ref.update({
      turns: updated,
      report,
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
    });

    res.json({ done: true, report, questionsAsked: updated.length });
  })
);

/** Abandon an active session without a report. */
router.delete(
  '/sessions/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await userDoc(req.uid!).collection('sessions').doc(param(req.params.id)).delete();
    res.json({ deleted: true });
  })
);

export default router;
