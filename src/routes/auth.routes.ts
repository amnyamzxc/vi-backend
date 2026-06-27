import { Router } from 'express';
import { sendCode, verifyCode } from '../controllers/auth.controller';
import jwt from 'jsonwebtoken';

const router = Router();
router.post('/send-code', sendCode);
router.post('/verify-code', verifyCode);

export const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key') as any;
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid verification token' });
  }
};

export default router;