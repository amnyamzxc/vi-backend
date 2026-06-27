import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const updateProfile = async (req: any, res: Response) => {
  const { username, displayName, avatarUrl } = req.body;
  const userId = req.userId;
  try {
    const existing = await prisma.user.findFirst({ where: { username, NOT: { id: userId } } });
    if (existing) return res.status(400).json({ error: 'Username already taken' });
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { username, displayName, avatarUrl },
    });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const searchUsers = async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') return res.json([]);
  const cleanQuery = q.startsWith('@') ? q.slice(1) : q;
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: cleanQuery, mode: 'insensitive' } },
        { phone: { contains: cleanQuery } },
      ],
    },
    take: 10,
  });
  return res.json(users);
};

export const addStars = async (req: any, res: Response) => {
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { stars: { increment: 250 } }
  });
  return res.json({ stars: user.stars });
};