import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes, { authMiddleware } from './routes/auth.routes';
import { searchUsers, updateProfile, addStars } from './controllers/user.controller';
import { getStoreGifts, purchaseAndSendGift, getUserGifts, upgradeToNft } from './controllers/gift.controller';
import { setupChatSockets } from './sockets/chat.socket';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' })); // увеличиваем лимит для голосовых (base64)

app.use('/api/auth', authRoutes);
app.put('/api/user/profile', authMiddleware, updateProfile);
app.get('/api/user/search', authMiddleware, searchUsers);
app.post('/api/user/stars', authMiddleware, addStars);

app.get('/api/gifts/store', authMiddleware, getStoreGifts);
app.post('/api/gifts/send', authMiddleware, purchaseAndSendGift);
app.get('/api/gifts/user/:userId', authMiddleware, getUserGifts);
app.post('/api/gifts/upgrade-nft', authMiddleware, upgradeToNft);

// ── История сообщений с пользователем ──────────────────────────────────────
app.get('/api/messages/:otherId', authMiddleware, async (req: any, res) => {
  const userId = req.userId;
  const { otherId } = req.params;
  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherId },
          { senderId: otherId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: { sender: true },
    });
    return res.json(messages);
  } catch (err) {
    return res.status(500).json({ error: 'Ошибка загрузки сообщений' });
  }
});

setupChatSockets(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server runs on port ${PORT}`));
