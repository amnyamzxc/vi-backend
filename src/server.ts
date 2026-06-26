import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Импорт твоих модулей
import authRoutes, { authMiddleware } from './routes/auth.routes';
import { searchUsers, updateProfile, addStars } from './controllers/user.controller';
import { getStoreGifts, purchaseAndSendGift, getUserGifts, upgradeToNft } from './controllers/gift.controller';
import { setupChatSockets } from './sockets/chat.socket';

dotenv.config();
const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// --- Роуты авторизации и профиля ---
app.use('/api/auth', authRoutes);
app.put('/api/user/profile', authMiddleware, updateProfile);
app.get('/api/user/search', authMiddleware, searchUsers);
app.post('/api/user/stars', authMiddleware, addStars);

// --- Роуты подарков ---
app.get('/api/gifts/store', authMiddleware, getStoreGifts);
app.post('/api/gifts/send', authMiddleware, purchaseAndSendGift);
app.get('/api/gifts/user/:userId', authMiddleware, getUserGifts);
app.post('/api/gifts/upgrade-nft', authMiddleware, upgradeToNft);

// --- Новый Роут: История сообщений ---
// Мы используем authMiddleware, чтобы знать, кто запрашивает историю
app.get('/api/messages/:otherId', authMiddleware, async (req: any, res) => {
  const myId = req.user.id;
  const { otherId } = req.params;

  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: myId, receiverId: otherId },
          { senderId: otherId, receiverId: myId }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Не удалось загрузить историю" });
  }
});

// Инициализация сокетов
setupChatSockets(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server runs on port ${PORT}`));
