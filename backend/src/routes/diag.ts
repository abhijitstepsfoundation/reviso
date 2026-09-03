import { Router } from 'express';
import { requireAuth, asyncHandler } from '../middleware/auth';
import { listModels, generateContent } from '../lib/gemini';
import { config } from '../config';

const router = Router();

/** Confirms Secret Manager access and shows which models this key can use. */
router.get(
  '/diag/models',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const models = await listModels();
    res.json({ configuredModel: config.geminiModel, availableModels: models });
  })
);

/** End-to-end check: Secret Manager -> Gemini -> response. */
router.get(
  '/diag/gemini',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const text = await generateContent({
      contents: [
        { role: 'user', parts: [{ text: 'Reply with exactly: Reviso is connected.' }] },
      ],
    });
    res.json({ model: config.geminiModel, reply: text });
  })
);

export default router;
