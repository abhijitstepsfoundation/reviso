import { Request, Response, NextFunction, RequestHandler } from 'express';
import { auth } from '../lib/firebase';

export interface AuthedRequest extends Request {
  uid?: string;
  email?: string;
  name?: string;
}

/**
 * Verifies the Firebase ID token on every protected request.
 * The user identity comes ONLY from the verified token.
 * A client-supplied userId in the body or query is never trusted.
 */
export const requireAuth: RequestHandler = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing authentication token' });
    return;
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;
    req.name = decoded.name;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Wraps an async handler so a rejected promise reaches the error handler
 * instead of hanging the request. Behaves the same on Express 4 and 5.
 */
export function asyncHandler(
  fn: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as AuthedRequest, res, next)).catch(next);
  };
}
