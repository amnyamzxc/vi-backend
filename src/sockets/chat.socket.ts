import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// userId -> socketId
const activeConnections = new Map<string, string>();

export const setupChatSockets = (io: Server) => {
  io.on('connection', (socket) => {

    // ─── Register user, set online ──────────────────────────────────────
    socket.on('register', async (userId: string) => {
      activeConnections.set(userId, socket.id);
      await prisma.user.update({ where: { id: userId }, data: { isOnline: true, lastSeen: new Date() } }).catch(() => {});
      io.emit('user_online', { userId, isOnline: true });
    });
Q
    // ─── Get user status (новый обработчик) ─────────────────────────────
    socket.on('get_user_status', async ({ userId }: { userId: string }) => {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { isOnline: true, lastSeen: true } }).catch(() => null);
      if (!u) return;
      socket.emit('user_online', { userId, isOnline: u.isOnline, lastSeen: u.lastSeen });
    });

    // ─── Private message ────────────────────────────────────────────────
    socket.on('send_message', async (data: {
      senderId: string; receiverId: string; content: string;
      type?: string; audioData?: string; imageData?: string; fileData?: string; fileName?: string;
    }) => {
      const message = await prisma.message.create({
        data: {
          content: data.content || '',
          type: data.type || 'text',
          audioData: data.audioData || null,
          imageData: data.imageData || null,
          fileData: data.fileData || null,
          fileName: data.fileName || null,
          senderId: data.senderId,
          receiverId: data.receiverId,
          isRead: false,
        },
        include: { sender: true },
      });

      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('receive_message', message);
      socket.emit('message_sent', message);
    });

    // ─── Gift message ────────────────────────────────────────────────────
    socket.on('send_gift_message', async (data: any) => {
      const message = await prisma.message.create({
        data: {
          content: `[Подарок: ${data.giftName}]`,
          type: 'gift',
          senderId: data.senderId,
          receiverId: data.receiverId,
          isRead: false,
        },
        include: { sender: true },
      });
      const enriched = { ...message, giftName: data.giftName, giftIcon: data.giftIcon };
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('receive_message', enriched);
      socket.emit('message_sent', enriched);
    });

    // ─── Mark as read ─────────────────────────────────────────────────────
    socket.on('mark_read', async (data: { messageIds: string[]; senderId: string }) => {
      await prisma.message.updateMany({
        where: { id: { in: data.messageIds } },
        data: { isRead: true },
      }).catch(() => {});
      const senderSocket = activeConnections.get(data.senderId);
      if (senderSocket) io.to(senderSocket).emit('messages_read', { messageIds: data.messageIds });
    });

    // ─── Edit message ─────────────────────────────────────────────────────
    socket.on('edit_message', async (data: { messageId: string; newContent: string; receiverId: string; senderId: string }) => {
      const msg = await prisma.message.update({
        where: { id: data.messageId },
        data: { content: data.newContent, isEdited: true },
      }).catch(() => null);
      if (!msg) return;
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('message_edited', msg);
      socket.emit('message_edited', msg);
    });

    // ─── Delete message ───────────────────────────────────────────────────
    socket.on('delete_message', async (data: { messageId: string; receiverId: string; senderId: string }) => {
      const msg = await prisma.message.update({
        where: { id: data.messageId },
        data: { isDeleted: true, content: '' },
      }).catch(() => null);
      if (!msg) return;
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('message_deleted', { messageId: data.messageId });
      socket.emit('message_deleted', { messageId: data.messageId });
    });

    // ─── Group: join room ─────────────────────────────────────────────────
    socket.on('join_group', (groupId: string) => {
      socket.join(`group:${groupId}`);
    });

    // ─── Group message ─────────────────────────────────────────────────────
    socket.on('send_group_message', async (data: {
      groupId: string; senderId: string; content: string; type?: string;
      audioData?: string; imageData?: string; fileData?: string; fileName?: string;
    }) => {
      const msg = await prisma.groupMessage.create({
        data: {
          content: data.content || '',
          type: data.type || 'text',
          audioData: data.audioData || null,
          imageData: data.imageData || null,
          fileData: data.fileData || null,
          fileName: data.fileName || null,
          groupId: data.groupId,
          senderId: data.senderId,
        },
        include: { sender: true },
      });
      io.to(`group:${data.groupId}`).emit('receive_group_message', msg);
    });

    // ─── Group: edit message ──────────────────────────────────────────────
    socket.on('edit_group_message', async (data: { messageId: string; newContent: string; groupId: string }) => {
      const msg = await prisma.groupMessage.update({
        where: { id: data.messageId },
        data: { content: data.newContent, isEdited: true },
      }).catch(() => null);
      if (msg) io.to(`group:${data.groupId}`).emit('group_message_edited', msg);
    });

    // ─── Group: delete message ─────────────────────────────────────────────
    socket.on('delete_group_message', async (data: { messageId: string; groupId: string }) => {
      await prisma.groupMessage.update({
        where: { id: data.messageId },
        data: { isDeleted: true, content: '' },
      }).catch(() => {});
      io.to(`group:${data.groupId}`).emit('group_message_deleted', { messageId: data.messageId });
    });

    // ─── WebRTC Signaling ─────────────────────────────────────────────────
    socket.on('start_call', (data: any) => {
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('incoming_call', data);
    });
    socket.on('answer_call', (data: any) => {
      const rxSocket = activeConnections.get(data.callerId);
      if (rxSocket) io.to(rxSocket).emit('call_answered', data);
    });
    socket.on('end_call', (data: any) => {
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('call_ended');
    });
    socket.on('ice_candidate', (data: any) => {
      const rxSocket = activeConnections.get(data.receiverId);
      if (rxSocket) io.to(rxSocket).emit('ice_candidate', data);
    });

    // ─── Disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      for (const [uid, sid] of activeConnections.entries()) {
        if (sid === socket.id) {
          activeConnections.delete(uid);
          const now = new Date();
          await prisma.user.update({
            where: { id: uid },
            data: { isOnline: false, lastSeen: now },
          }).catch(() => {});
          io.emit('user_online', { userId: uid, isOnline: false, lastSeen: now });
          break;
        }
      }
    });
  });
};
