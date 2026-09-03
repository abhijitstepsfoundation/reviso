import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth, asyncHandler } from '../middleware/auth';
import { db } from '../lib/firebase';

const router = Router();

/**
 * Returns the signed-in user's own profile document, creating it on
 * first sign-in. All data is written under /users/{uid}.
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.uid!;
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();

    if (!snap.exists) {
      await ref.set({
        displayName: req.name || 'Student',
        email: req.email || null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    const fresh = await ref.get();
    res.json({ uid, ...fresh.data() });
  })
);

/** Privacy: lets a user erase everything Reviso holds about them. */
router.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.uid!;
    await db.recursiveDelete(db.collection('users').doc(uid));
    res.json({ deleted: true });
  })
);

export default router;
