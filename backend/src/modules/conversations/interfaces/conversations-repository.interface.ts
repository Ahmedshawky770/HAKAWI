import { symbol } from '../../common/utils/symbol.util.js';
import type { Conversation } from '../../../db/schema/conversations.schema.js';
import type { NewConversation } from '../../../db/schema/conversations.schema.js';

export const CONVERSATIONS_REPOSITORY = symbol('CONVERSATIONS_REPOSITORY');

export type CreateConversationData = NewConversation;
export type UpdateConversationData = Partial<CreateConversationData>;

export { Conversation };

export interface IConversationsRepository {
  findById(id: string): Promise<Conversation | null>;
  findByParticipantId(userId: string): Promise<Conversation[]>;
  findByParticipants(participantIds: string[]): Promise<Conversation | null>;
  create(data: CreateConversationData): Promise<Conversation>;
  update(id: string, data: Partial<UpdateConversationData>): Promise<Conversation>;
  delete(id: string): Promise<void>;
}
