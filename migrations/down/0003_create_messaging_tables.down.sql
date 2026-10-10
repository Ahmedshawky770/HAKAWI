-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops notifications, conversations and messages together with every message ever sent.
DROP INDEX IF EXISTS "idx_messages_sender_id";
DROP INDEX IF EXISTS "idx_messages_conversation_id";
DROP INDEX IF EXISTS "idx_conversations_unique";
DROP INDEX IF EXISTS "idx_conversations_participant2_id";
DROP INDEX IF EXISTS "idx_conversations_participant1_id";
DROP INDEX IF EXISTS "idx_notifications_read";
DROP INDEX IF EXISTS "idx_notifications_user_id";
DROP TABLE IF EXISTS "messages";
DROP TABLE IF EXISTS "conversations";
DROP TABLE IF EXISTS "notifications";
