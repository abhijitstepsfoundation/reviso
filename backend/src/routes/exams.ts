import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth, asyncHandler } from '../middleware/auth';
import { db, bucket } from '../lib/firebase';
import { generatePaper, gradeAnswers, Paper } from '../services/writtenExam';

const router = Router();

const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PAGES = 5;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

function param(v: unknown): string {
  return Array.isArray(v) ? String(v[0]) : String(v ?? '');
}

const userDoc = (uid: string) => db.collection('users').doc(uid);

/**
 * Removes the marking rubric before a paper is sent to the browser.
 * Marking points are the answers; a student sitting the paper must not
 * be able to read them out of the network response.
 */
function paperForStudent(paper: Paper, revealRubric = false) {
  if (revealRubric) return paper;
  return {
    ...paper,
    questions: paper.questions.map(({ markingPoints, ...rest }) => rest),
  };
}

/** List the user's own exams. */
router.get(
  '/exams',
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await userDoc(req.uid!)
      .collection('exams')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    res.json(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          materialTitle: data.materialTitle,
          title: data.paper?.title || data.materialTitle,
          status: data.status,
          totalMarks: data.paper?.totalMarks ?? null,
          totalAwarded: data.result?.totalAwarded ?? null,
          scriptAppearance: data.result?.scriptAppearance ?? null,
          questionCount: data.paper?.questions?.length ?? null,
          durationMinutes: data.paper?.durationMinutes ?? null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      })
    );
  })
);

/** Fetch one exam. The rubric is withheld until the script is marked. */
router.get(
  '/exams/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await userDoc(req.uid!).collection('exams').doc(param(req.params.id)).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Exam not found' });
      return;
    }

    const data = doc.data()!;
    res.json({
      id: doc.id,
      materialTitle: data.materialTitle,
      status: data.status,
      paper: paperForStudent(data.paper, data.status === 'graded'),
      result: data.result || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    });
  })
);

/** Set a new paper from one of the user's own materials. */
router.post(
  '/exams',
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

    const paper = await generatePaper(mat.extractedText, mat.title || 'your material');

    const ref = userDoc(uid).collection('exams').doc();
    await ref.set({
      materialId,
      materialTitle: mat.title || 'Untitled material',
      status: 'ready',
      paper,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({
      id: ref.id,
      materialTitle: mat.title,
      status: 'ready',
      paper: paperForStudent(paper),
    });
  })
);

/**
 * Submit photographs of the handwritten script for marking.
 * Pages arrive base64-encoded and are written to Cloud Storage by the
 * backend, so the browser never holds bucket credentials.
 */
router.post(
  '/exams/:id/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.uid!;
    const examId = param(req.params.id);
    const pages = Array.isArray(req.body?.pages) ? req.body.pages : [];

    if (pages.length === 0) {
      res.status(400).json({ error: 'Add at least one photo of your answers.' });
      return;
    }
    if (pages.length > MAX_PAGES) {
      res.status(400).json({ error: `Please upload at most ${MAX_PAGES} pages.` });
      return;
    }

    const decoded: { mimeType: string; buffer: Buffer }[] = [];
    for (const page of pages) {
      const mimeType = String(page?.mimeType || '');
      if (!ALLOWED_IMAGE.has(mimeType)) {
        res.status(400).json({ error: 'Pages must be JPG, PNG or WebP photos.' });
        return;
      }
      const buffer = Buffer.from(String(page?.data || ''), 'base64');
      if (buffer.length === 0) {
        res.status(400).json({ error: 'One of those pages could not be read.' });
        return;
      }
      if (buffer.length > MAX_PAGE_BYTES) {
        res.status(400).json({ error: 'Each page must be under 4 MB.' });
        return;
      }
      decoded.push({ mimeType, buffer });
    }

    const ref = userDoc(uid).collection('exams').doc(examId);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Exam not found' });
      return;
    }

    const data = doc.data()!;
    if (data.status === 'graded') {
      res.status(400).json({ error: 'This script has already been marked.' });
      return;
    }

    const matDoc = await userDoc(uid).collection('materials').doc(data.materialId).get();
    const notes = matDoc.data()?.extractedText;
    if (!notes) {
      res.status(400).json({ error: 'The material for this exam is no longer available.' });
      return;
    }

    // Store the script first so the student's work is never lost to a
    // grading failure.
    const storagePaths: string[] = [];
    for (let i = 0; i < decoded.length; i++) {
      const ext = decoded[i].mimeType.split('/')[1] || 'jpg';
      const path = `users/${uid}/exams/${examId}/page-${i + 1}.${ext}`;
      await bucket.file(path).save(decoded[i].buffer, {
        contentType: decoded[i].mimeType,
        metadata: { metadata: { owner: uid } },
      });
      storagePaths.push(path);
    }

    await ref.update({ scriptPaths: storagePaths, pageCount: decoded.length });

    const result = await gradeAnswers(data.paper as Paper, notes, decoded);

    await ref.update({
      result,
      status: 'graded',
      gradedAt: FieldValue.serverTimestamp(),
    });

    res.json({ id: examId, status: 'graded', result });
  })
);

/** Delete an exam and any stored script pages. */
router.delete(
  '/exams/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ref = userDoc(req.uid!).collection('exams').doc(param(req.params.id));
    const doc = await ref.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Exam not found' });
      return;
    }

    const paths: string[] = doc.data()?.scriptPaths || [];
    await Promise.all(
      paths.map((p) => bucket.file(p).delete().catch(() => undefined))
    );
    await ref.delete();

    res.json({ deleted: true });
  })
);

export default router;
