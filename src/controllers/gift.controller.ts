import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const nftSkins = [
  { name: 'Crystal Pulse', chance: 18, style: 'from-cyan-300 via-blue-400 to-indigo-500' },
  { name: 'Solar Crown', chance: 15, style: 'from-amber-300 via-orange-400 to-rose-500' },
  { name: 'Neon Circuit', chance: 14, style: 'from-lime-300 via-emerald-400 to-teal-500' },
  { name: 'Velvet Nova', chance: 12, style: 'from-fuchsia-300 via-pink-400 to-rose-500' },
  { name: 'Moon Chrome', chance: 10, style: 'from-slate-200 via-zinc-300 to-slate-500' },
  { name: 'Royal Prism', chance: 9, style: 'from-violet-300 via-purple-400 to-indigo-600' },
  { name: 'Aqua Myth', chance: 8, style: 'from-sky-300 via-cyan-400 to-blue-600' },
  { name: 'Ember Core', chance: 6, style: 'from-red-400 via-orange-500 to-yellow-400' },
  { name: 'Ghost Mint', chance: 5, style: 'from-emerald-100 via-mint-300 to-cyan-300' },
  { name: 'Black Diamond', chance: 3, style: 'from-zinc-700 via-slate-950 to-amber-300' },
];

const nftBackgrounds = [
  { name: 'Aurora Field', chance: 18, style: 'radial-gradient(circle at 20% 20%, rgba(45,212,191,.34), transparent 32%), linear-gradient(135deg, rgba(15,23,42,.98), rgba(30,64,175,.55))' },
  { name: 'Golden Stage', chance: 15, style: 'radial-gradient(circle at 70% 10%, rgba(251,191,36,.42), transparent 28%), linear-gradient(135deg, rgba(69,26,3,.95), rgba(120,53,15,.62))' },
  { name: 'Cyber Grid', chance: 14, style: 'linear-gradient(135deg, rgba(6,78,59,.94), rgba(15,23,42,.84)), repeating-linear-gradient(90deg, rgba(52,211,153,.2) 0 1px, transparent 1px 12px)' },
  { name: 'Pink Nebula', chance: 12, style: 'radial-gradient(circle at 30% 30%, rgba(244,114,182,.38), transparent 35%), linear-gradient(135deg, rgba(76,5,25,.95), rgba(88,28,135,.55))' },
  { name: 'Silver Hall', chance: 10, style: 'linear-gradient(135deg, rgba(15,23,42,.96), rgba(148,163,184,.36)), radial-gradient(circle at 80% 20%, rgba(226,232,240,.3), transparent 28%)' },
  { name: 'Royal Rift', chance: 9, style: 'radial-gradient(circle at 60% 25%, rgba(167,139,250,.42), transparent 30%), linear-gradient(135deg, rgba(30,27,75,.96), rgba(76,29,149,.58))' },
  { name: 'Deep Ocean', chance: 8, style: 'linear-gradient(135deg, rgba(8,47,73,.96), rgba(14,116,144,.62)), radial-gradient(circle at 50% 100%, rgba(125,211,252,.3), transparent 35%)' },
  { name: 'Lava Room', chance: 6, style: 'radial-gradient(circle at 40% 80%, rgba(248,113,113,.42), transparent 30%), linear-gradient(135deg, rgba(69,10,10,.96), rgba(154,52,18,.62))' },
  { name: 'Mint Dream', chance: 5, style: 'linear-gradient(135deg, rgba(6,95,70,.92), rgba(20,184,166,.48)), radial-gradient(circle at 75% 25%, rgba(187,247,208,.35), transparent 28%)' },
  { name: 'Obsidian Vault', chance: 3, style: 'radial-gradient(circle at 50% 12%, rgba(251,191,36,.34), transparent 24%), linear-gradient(135deg, rgba(2,6,23,.98), rgba(24,24,27,.9))' },
];

function pickWeighted<T extends { chance: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.chance, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.chance;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

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
      if (!userGift || userGift.receiverId !== req.userId || userGift.isNft) throw new Error('Invalid item metadata status');

      const randomSerial = `NFT #${Math.floor(1000 + Math.random() * 9000)}`;
      const skin = pickWeighted(nftSkins);
      const background = pickWeighted(nftBackgrounds);
      await tx.user.update({ where: { id: req.userId }, data: { stars: { decrement: 100 } } });
      return await tx.userGift.update({
        where: { id: userGiftId },
        data: {
          isNft: true,
          nftNumber: randomSerial,
          nftSkin: skin.name,
          nftSkinChance: skin.chance,
          nftStyle: skin.style,
          nftBackground: background.name,
          nftBackgroundChance: background.chance,
          nftBackgroundStyle: background.style,
        } as any,
        include: { gift: true, sender: true },
      });
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const transferNft = async (req: any, res: Response) => {
  const { userGiftId, receiver } = req.body;
  const query = String(receiver || '').trim();
  if (!userGiftId || !query) return res.status(400).json({ error: 'NFT and receiver are required' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const userGift = await tx.userGift.findUnique({
        where: { id: userGiftId },
        include: { gift: true, sender: true },
      });
      if (!userGift || !userGift.isNft || userGift.receiverId !== req.userId) {
        throw new Error('Only the current owner can transfer this NFT');
      }

      const cleanQuery = query.startsWith('@') ? query.slice(1) : query;
      const receiverUser = await tx.user.findFirst({
        where: {
          OR: [
            { id: cleanQuery },
            { username: cleanQuery },
            { phone: cleanQuery },
          ],
        },
      });
      if (!receiverUser) throw new Error('Receiver not found');
      if (receiverUser.id === req.userId) throw new Error('Cannot transfer NFT to yourself');

      return await tx.userGift.update({
        where: { id: userGiftId },
        data: { receiverId: receiverUser.id, senderId: req.userId },
        include: { gift: true, sender: true, receiver: true },
      });
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};
