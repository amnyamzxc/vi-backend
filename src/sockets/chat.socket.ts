import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const activeConnections = new Map<string, string>();

export const setupChatSockets = (io: Server) => {
  io.on('connection', (socket) => {
    socket.on('register', (userId: string) => {
      activeConnections.set(userId, socket.id);
    });
    socket.on('send_message', async (data: { senderId: string; receiverId: string; content: string }) => {
      const message = await prisma.message.create({
        data: { content: data.content, senderId: data.senderId, receiverId: data.receiverId },
        include: { sender: true },
      });
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('receive_message', message);
      socket.emit('receive_message', message);
    });
    socket.on('disconnect', () => {
      for (const [uid, sid] of activeConnections.entries()) {
        if (sid === socket.id) { activeConnections.delete(uid); break; }
      }
    });
  });
};