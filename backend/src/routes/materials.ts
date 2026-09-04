import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth, asyncHandler } from '../middleware/auth';
import { db, bucket } from '../lib/firebase';
import { countPdfPages } from '../lib/pdf';
import { extractStudyText, analyseStudyText } from '../services/materials';

const router = Router();

const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/markdown',
]);

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = Number(process.env.MAX_PDF_PAGES || 20);

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

/** Express 5 types route params as string | string[]. */
function param(v: unknown): string {
  return Array.isArray(v) ? String(v[0]) : String(v ?? '');
}

/** List the signed-in user's own materials. */
router.get(
  '/materials',
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await db
      .collection('users')
      .doc(req.uid!)
      .collection('materials')
      .orderBy('createdAt', 'desc')
      .get();

    res.json(
      snap.docs.map((d) => {
        const { extractedText, ...rest } = d.data();
        return { id: d.id, ...rest };
      })
    );
  })
);

/** Fetch one material. The uid comes from the token, never from the client. */
router.get(
  '/materials/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const doc = await db
      .collection('users')
      .doc(req.uid!)
      .collection('materials')
      .doc(param(req.params.id))
      .get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Material not found' });
      return;
    }

    const { extractedText, ...rest } = doc.data()!;
    res.json({ id: doc.id, ...rest });
  })
);

/**
 * Upload a study material.
 * The browser sends the file base64-encoded in the JSON body. The backend
 * verifies the token and writes to Cloud Storage itself, so no client ever
 * holds bucket access.
 *
 * All validation happens before anything is stored or sent to Gemini, so a
 * rejected upload leaves no orphaned document, no object in the bucket and
 * no API spend.
 */
router.post(
  '/materials',
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.uid!;
    const { fileName, mimeType, data } = req.body || {};

    if (typeof data !== 'string' || !data) {
      res.status(400).json({ error: 'No file was uploaded.' });
      return;
    }
    if (typeof mimeType !== 'string' || !ALLOWED.has(mimeType)) {
      res.status(400).json({ error: 'Please upload a PDF, JPG, PNG or text file.' });
      return;
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) {
      res.status(400).json({ error: 'That file appears to be empty.' });
      return;
    }
    if (buffer.length > MAX_BYTES) {
      res.status(400).json({ error: 'That file is larger than 10 MB.' });
      return;
    }

    let pageCount: number | null = null;
    if (mimeType === 'application/pdf') {
      pageCount = await countPdfPages(buffer);
      if (pageCount !== null && pageCount > MAX_PAGES) {
        res.status(400).json({
          error: `That PDF has ${pageCount} pages. Reviso examines one chapter at a time, so please upload up to ${MAX_PAGES} pages. Splitting a textbook into chapters also produces sharper questions.`,
        });
        return;
      }
    }

    const safeName = String(fileName || 'material').slice(0, 160);
    const ref = db.collection('users').doc(uid).collection('materials').doc();
    const storagePath = `users/${uid}/materials/${ref.id}/source.${
      EXT[mimeType] || 'bin'
    }`;

    await ref.set({
      title: safeName.replace(/\.[^.]+$/, '').slice(0, 120),
      fileName: safeName,
      mimeType,
      sizeBytes: buffer.length,
      ...(pageCount !== null ? { pageCount } : {}),
      storagePath,
      status: 'processing',
      createdAt: FieldValue.serverTimestamp(),
    });

    try {
      await bucket.file(storagePath).save(buffer, {
        contentType: mimeType,
        metadata: { metadata: { owner: uid } },
      });

      const extractedText = await extractStudyText(buffer, mimeType);
      const analysis = await analyseStudyText(extractedText);

      await ref.update({
        ...analysis,
        extractedText,
        status: 'ready',
        processedAt: FieldValue.serverTimestamp(),
      });

      res.json({ id: ref.id, ...analysis, status: 'ready' });
    } catch (err: any) {
      await ref.update({
        status: 'failed',
        error: String(err?.message || 'Processing failed').slice(0, 300),
      });
      throw err;
    }
  })
);

/** Delete a material and its stored source file. */
router.delete(
  '/materials/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ref = db
      .collection('users')
      .doc(req.uid!)
      .collection('materials')
      .doc(param(req.params.id));

    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Material not found' });
      return;
    }

    const path = doc.data()?.storagePath;
    if (path) {
      await bucket.file(path).delete().catch(() => undefined);
    }
    await ref.delete();

    res.json({ deleted: true });
  })
);

export default router;
