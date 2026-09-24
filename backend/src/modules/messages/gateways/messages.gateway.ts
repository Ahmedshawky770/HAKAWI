import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { JwtHelper } from '../../../common/utils/jwt.util.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { MessagesService } from '../messages.service.ts';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/messages',
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly connectedUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtHelper: JwtHelper,
    private readonly logger: WinstonLoggerService,
    private readonly messagesService: MessagesService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = client.handshake.auth.token || (client.handshake.headers.authorization as string | undefined)?.split(' ')[1];
      if (!token) {
        this.logger.warn('WebSocket connection rejected: missing token', 'MessagesGateway');
        client.disconnect();
        return;
      }

      const payload = this.jwtHelper.verifyAccessToken(token);
      client.userId = payload.sub;

      if (!this.connectedUsers.has(payload.sub)) {
        this.connectedUsers.set(payload.sub, new Set<string>());
      }
      this.connectedUsers.get(payload.sub)!.add(client.id);

      if (this.server) {
        this.server.emit('user.online', { userId: payload.sub });
      }
      this.logger.info(`WebSocket user connected: ${payload.sub}`, 'MessagesGateway');
    } catch {
      this.logger.warn('WebSocket connection rejected: invalid token', 'MessagesGateway');
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    if (client.userId) {
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
          if (this.server) {
            this.server.emit('user.offline', { userId: client.userId });
          }
        }
      }
      this.logger.info(`WebSocket user disconnected: ${client.userId}`, 'MessagesGateway');
    }
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ): Promise<{ event: string; data: { conversationId: string } }> {
    if (!client.userId) {
      throw new Error('Unauthorized');
    }

    const { conversationId } = data;
    try {
      await this.messagesService.getMessages(conversationId, client.userId, 1, 1);
    } catch {
      throw new Error('Conversation not found');
    }

    client.join(conversationId);
    this.logger.info(`User ${client.userId} joined conversation ${conversationId}`, 'MessagesGateway');

    return { event: 'joined', data: { conversationId } };
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ): { event: string; data: { conversationId: string } } {
    if (!client.userId) {
      throw new Error('Unauthorized');
    }

    client.leave(data.conversationId);
    this.logger.info(`User ${client.userId} left conversation ${data.conversationId}`, 'MessagesGateway');

    return { event: 'left', data: { conversationId: data.conversationId } };
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; content: string },
  ): Promise<{ event: string; data: { messageId: string } }> {
    if (!client.userId) {
      throw new Error('Unauthorized');
    }

    const message = await this.messagesService.sendMessage(data.conversationId, client.userId, data.content);

    return { event: 'message.sent', data: { messageId: message.id } };
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string },
  ): Promise<{ event: string; data: { messageId: string } }> {
    if (!client.userId) {
      throw new Error('Unauthorized');
    }

    const message = await this.messagesService.markAsRead(data.messageId, client.userId);

    return { event: 'message.markedAsRead', data: { messageId: message.id } };
  }

  @SubscribeMessage('userTyping')
  handleUserTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ): { event: string; data: { conversationId: string; isTyping: boolean } } {
    if (!client.userId) {
      throw new Error('Unauthorized');
    }

    client.to(data.conversationId).emit('user.typing', {
      userId: client.userId,
      conversationId: data.conversationId,
      isTyping: data.isTyping,
    });

    return { event: 'typing', data: { conversationId: data.conversationId, isTyping: data.isTyping } };
  }

  emitMessageReceived(message: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    isRead: boolean;
    readAt: Date | null;
    createdAt: Date;
  }): void {
    if (!this.server) {
      return;
    }
    this.server.to(message.conversationId).emit('message.received', {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      isRead: message.isRead,
      readAt: message.readAt,
      createdAt: message.createdAt,
    });
  }

  emitMessageRead(data: { messageId: string; conversationId: string; readBy: string; readAt: string | null }): void {
    if (!this.server) {
      return;
    }
    this.server.to(data.conversationId).emit('message.read', {
      messageId: data.messageId,
      conversationId: data.conversationId,
      readBy: data.readBy,
      readAt: data.readAt,
    });
  }

  emitUserOnline(userId: string): void {
    if (!this.server) {
      return;
    }
    this.server.emit('user.online', { userId });
  }

  emitUserOffline(userId: string): void {
    if (!this.server) {
      return;
    }
    this.server.emit('user.offline', { userId });
  }
}
