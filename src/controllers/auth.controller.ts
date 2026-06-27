import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export const sendCode = async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });
  console.log(`[MOCK SMS] Verification code for ${phone} is: 1111`);
  return res.json({ message: 'Code sent successfully (Mock: 1111)' });
};

export const verifyCode = async (req: Request, res: Response) => {
  const { phone, code } = req.body;
  if (code !== '1111') return res.status(400).json({ error: 'Invalid verification code' });

  let user = await prisma.user.findUnique({ where: { phone } });
  let isNewUser = false;

  if (!user) {
    user = await prisma.user.create({ data: { phone, stars: 500 } });
    isNewUser = true;
    await seedGiftsIfEmpty();
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  return res.json({ token, user, isNewUser: isNewUser || !user.username });
};

async function seedGiftsIfEmpty() {
  const count = await prisma.giftTemplate.count();
  if (count === 0) {
    await prisma.giftTemplate.createMany({
      data: [
        { name: 'Торт', type: 'PERMANENT', price: 20, icon: 'cake' },
        { name: 'Кубок', type: 'PERMANENT', price: 50, icon: 'trophy' },
        { name: 'Бриллиант', type: 'LIMITED', price: 200, icon: 'diamond', totalStock: 50, remaining: 50 },
        { name: 'Ракета', type: 'LIMITED', price: 500, icon: 'rocket', totalStock: 10, remaining: 10 },
      ],
    });
  }
}