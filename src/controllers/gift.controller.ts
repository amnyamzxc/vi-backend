import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getStoreGifts = async (req: Request, res: Response) => {
  const items = await prisma.giftTemplate.findMany();
  return res.json(items);
};

export const purchaseAndSendGift = async (req: any, res: Response) => {
  const { giftId, receiverId } = req.body;
  const senderId = req.userId;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const sender = await tx.user.findUnique({ where: { id: senderId } });
      const gift = await tx.giftTemplate.findUnique({ where: { id: giftId } });
      if (!sender || !gift) throw new Error('Gift asset metadata not found');
      if (sender.stars < gift.price) throw new Error('Not enough stars');

      if (gift.type === 'LIMITED') {
        if (!gift.remaining || gift.remaining <= 0) throw new Error('Out of stock');
        await tx.giftTemplate.update({
          where: { id: giftId },
          data: { remaining: { decrement: 1 } },
        });
      }
      await tx.user.update({
        where: { id: senderId },
        data: { stars: { decrement: gift.price } },
      });
      return await tx.userGift.create({
        data: { giftId, senderId, receiverId },
        include: { gift: true },
      });
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const getUserGifts = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const gifts = await prisma.userGift.findMany({
    where: { receiverId: userId },
    include: { gift: true, sender: true },
  });
  return res.json(gifts);
};

export const upgradeToNft = async (req: any, res: Response) => {
  const { userGiftId } = req.body;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: req.userId } });
      if (!user || user.stars < 100) throw new Error('Insufficient stars (100 required)');
      const userGift = await tx.userGift.findUnique({ where: { id: userGiftId } });
      if (!userGift || userGift.isNft) throw new Error('Invalid item metadata status');

      const randomSerial = `NFT #${Math.floor(1000 + Math.random() * 9000)}`;
      await tx.user.update({ where: { id: req.userId }, data: { stars: { decrement: 100 } } });
      return await tx.userGift.update({
        where: { id: userGiftId },
        data: { isNft: true, nftNumber: randomSerial },
        include: { gift: true, sender: true },
      });
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};