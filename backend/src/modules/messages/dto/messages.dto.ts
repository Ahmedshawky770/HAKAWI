import { IsString, IsArray, IsInt, MinLength, MaxLength, Min } from 'class-validator';

export class CreateConversationDto {
  @IsArray()
  @IsString({ each: true })
  @MinLength(2, { message: 'At least 2 participants are required' })
  participantIds: string[];
}

export class CreateMessageDto {
  @IsString()
  conversationId: string;

  @IsString()
  @MinLength(1, { message: 'Message content cannot be empty' })
  @MaxLength(5000, { message: 'Message must not exceed 5000 characters' })
  content: string;
}

export class MessageResponseDto {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ConversationResponseDto {
  id: string;
  participantIds: string[];
  lastMessageAt: Date;
  createdAt: Date;
}

export class MarkAsReadDto {
  @IsString()
  messageId: string;
}
