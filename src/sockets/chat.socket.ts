import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const activeConnections = new Map<string, string>();

export const setupChatSockets = (io: Server) => {
  io.on('connection', (socket) => {

    // Регистрация пользователя
    socket.on('register', (userId: string) => {
      activeConnections.set(userId, socket.id);
    });

    // ── Текстовые и голосовые сообщения ──────────────────────────────────
    socket.on('send_message', async (data: {
      senderId: string;
      receiverId: string;
      content?: string;
      type?: string;
      audioData?: string;
    }) => {
      // Для голосовых храним content как маркер, audioData — в отдельном поле
      // (в схеме Message можно добавить audioData, но для простоты шлём как есть через socket)
      const message = await prisma.message.create({
        data: {
          content: data.content || (data.type === 'voice' ? '[Голосовое сообщение]' : ''),
          senderId: data.senderId,
          receiverId: data.receiverId,
        },
        include: { sender: true },
      });

      const payload = {
        ...message,
        type: data.type || 'text',
        audioData: data.audioData,
      };

      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('receive_message', payload);
      socket.emit('receive_message', payload);
    });

    // ── Подарок в чате ────────────────────────────────────────────────────
    socket.on('send_gift_message', (data: {
      senderId: string;
      receiverId: string;
      giftName?: string;
      giftIcon?: string;
    }) => {
      const payload = {
        senderId: data.senderId,
        receiverId: data.receiverId,
        type: 'gift',
        giftName: data.giftName,
        giftIcon: data.giftIcon,
        createdAt: new Date(),
      };
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('receive_gift_message', payload);
    });

    // ── WebRTC сигналинг ──────────────────────────────────────────────────
    socket.on('start_call', (data: { callerId: string; receiverId: string; offer: any }) => {
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) {
        io.to(rxSocket).emit('incoming_call', {
          callerId: data.callerId,
          offer: data.offer,
        });
      }
    });

    socket.on('answer_call', (data: { callerId: string; answer: any }) => {
      const callerSocket = activeConnections.get(data.callerId);
      if (callerSocket) {
        io.to(callerSocket).emit('call_answered', { answer: data.answer });
      }
    });

    socket.on('ice_candidate', (data: { receiverId: string; candidate: any }) => {
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) {
        io.to(rxSocket).emit('ice_candidate', { candidate: data.candidate });
      }
    });

    socket.on('end_call', (data: { receiverId: string }) => {
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) {
        io.to(rxSocket).emit('call_ended');
      }
    });

    // ── Отключение ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      for (const [uid, sid] of activeConnections.entries()) {
        if (sid === socket.id) {
          activeConnections.delete(uid);
          break;
        }
      }
    });
  });
};
