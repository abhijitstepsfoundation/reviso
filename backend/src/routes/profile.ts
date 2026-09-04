import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth, asyncHandler, AuthedRequest } from '../middleware/auth';
import { db } from '../lib/firebase';
import { buildDigest, buildProfile } from '../services/profile';

const router = Router();

const userDoc = (uid: string) => db.collection('users').doc(uid);
const profileRef = (uid: string) =>
  userDoc(uid).collection('profile').doc('current');

/** Reads the caller's completed assessments from their own subtree. */
async function loadAssessments(uid: string) {
  const [sessionSnap, examSnap] = await Promise.all([
    userDoc(uid).collection('sessions').where('status', '==', 'completed').get(),
    userDoc(uid).collection('exams').where('status', '==', 'graded').get(),
  ]);

  const sessions = sessionSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
  }));

  const exams = examSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
  }));

  return { sessions, exams };
}

/**
 * A cheap fingerprint of the assessment history. When it is unchanged the
 * stored profile is still accurate, so no Gemini call is needed.
 */
function signature(sessions: any[], exams: any[]): string {
  const ids = [
    ...sessions.map((s) => `s:${s.id}`),
    ...exams.map((e) => `e:${e.id}`),
  ].sort();
  return ids.join('|');
}

/**
 * Returns the learning profile, rebuilding it only when new assessments
 * have been completed since it was last generated.
 */
router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const uid = req.uid!;
    const { sessions, exams } = await loadAssessments(uid);

    if (sessions.length === 0 && exams.length === 0) {
      res.json({
        profile: null,
        empty: true,
        message:
          'Complete an oral viva or a written paper and your learning profile will appear here.',
      });
      return;
    }

    const sig = signature(sessions, exams);
    const existing = await profileRef(uid).get();

    if (existing.exists && existing.data()?.signature === sig) {
      res.json({
        profile: existing.data()?.profile,
        empty: false,
        cached: true,
        generatedAt: existing.data()?.generatedAt?.toDate?.()?.toISOString() ?? null,
      });
      return;
    }

    const digest = buildDigest(sessions, exams);
    const profile = await buildProfile(digest);

    await profileRef(uid).set({
      profile,
      signature: sig,
      generatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ profile, empty: false, cached: false });
  })
);

/** Forces a rebuild, ignoring the cached profile. */
router.post(
  '/profile/refresh',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const uid = req.uid!;
    const { sessions, exams } = await loadAssessments(uid);

    if (sessions.length === 0 && exams.length === 0) {
      res.status(400).json({ error: 'There are no completed assessments yet.' });
      return;
    }

    const digest = buildDigest(sessions, exams);
    const profile = await buildProfile(digest);

    await profileRef(uid).set({
      profile,
      signature: signature(sessions, exams),
      generatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ profile, empty: false, cached: false });
  })
);

export default router;
