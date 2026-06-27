import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes, { authMiddleware } from './routes/auth.routes';
import { searchUsers, updateProfile, addStars } from './controllers/user.controller';
import { getStoreGifts, purchaseAndSendGift, getUserGifts, upgradeToNft, transferNft, sellGift } from './controllers/gift.controller';
import { setupChatSockets } from './sockets/chat.socket';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/auth', authRoutes);
app.put('/api/user/profile', authMiddleware, updateProfile);
app.get('/api/user/search', authMiddleware, searchUsers);
app.post('/api/user/stars', authMiddleware, addStars);

app.get('/api/gifts/store', authMiddleware, getStoreGifts);
app.post('/api/gifts/send', authMiddleware, purchaseAndSendGift);
app.get('/api/gifts/user/:userId', authMiddleware, getUserGifts);
app.post('/api/gifts/upgrade-nft', authMiddleware, upgradeToNft);
app.post('/api/gifts/transfer-nft', authMiddleware, transferNft);
app.post('/api/gifts/sell', authMiddleware, sellGift);

// ─── Messages history ──────────────────────────────────────────────────────
app.get('/api/messages/:userId', authMiddleware, async (req: any, res) => {
  const me = req.user.userId;
  const other = req.params.userId;
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: me, receiverId: other },
        { senderId: other, receiverId: me },
      ],
    },
    orderBy: { createdAt: 'asc' },
    include: { sender: true },
  });
  res.json(messages);
});

// ─── Groups CRUD ────────────────────────────────────────────────────────────
app.post('/api/groups', authMiddleware, async (req: any, res) => {
  const { name, description, type, memberIds } = req.body;
  const ownerId = req.user.userId;
  const group = await prisma.group.create({
    data: {
      name, description: description || '', type: type || 'group', ownerId,
      members: {
        create: [
          { userId: ownerId, role: 'owner' },
          ...((memberIds || []).filter((id: string) => id !== ownerId).map((id: string) => ({ userId: id, role: 'member' }))),
        ],
      },
    },
    include: { members: { include: { user: true } } },
  });
  res.json(group);
});

app.get('/api/groups', authMiddleware, async (req: any, res) => {
  const userId = req.user.userId;
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId } } },
    include: { members: { include: { user: true } }, _count: { select: { members: true } } },
  });
  res.json(groups);
});

app.get('/api/groups/:groupId/messages', authMiddleware, async (req: any, res) => {
  const messages = await prisma.groupMessage.findMany({
    where: { groupId: req.params.groupId },
    orderBy: { createdAt: 'asc' },
    include: { sender: true },
  });
  res.json(messages);
});

app.post('/api/groups/:groupId/members', authMiddleware, async (req: any, res) => {
  const { userId } = req.body;
  const member = await prisma.groupMember.create({
    data: { groupId: req.params.groupId, userId, role: 'member' },
  }).catch(() => null);
  res.json({ success: !!member });
});

setupChatSockets(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server runs on port ${PORT}`));
