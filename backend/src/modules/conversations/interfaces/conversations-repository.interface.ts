export interface IConversationsRepository {
  findById(id: string): Promise<Conversation | null>;
  findByParticipantId(userId: string): Promise<Conversation[]>;
  findByParticipants(participantIds: string[]): Promise<Conversation | null>;
  create(data: CreateConversationData): Promise<Conversation>;
  update(id: string, data: Partial<UpdateConversationData>): Promise<Conversation>;
  delete(id: string): Promise<void>;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConversationData {
  participantIds: string[];
  lastMessageAt?: Date | null;
}

export interface UpdateConversationData extends Partial<Pick<Conversation, 'lastMessageAt'>> {}

export const CONVERSATIONS_REPOSITORY = 'CONVERSATIONS_REPOSITORY';
