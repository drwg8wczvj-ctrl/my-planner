-- ─────────────────────────────────────────────────────────────
-- NORA — Hybrid Memory System migrations
-- Run once in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- 1. Chat messages (24-hour rolling window)
CREATE TABLE IF NOT EXISTS chat_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  message    text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chat messages"
  ON chat_messages FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Speeds up the "last 24h" query
CREATE INDEX IF NOT EXISTS chat_messages_user_created
  ON chat_messages (user_id, created_at DESC);


-- 2. Persistent user preferences (never deleted)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON user_preferences FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- OPTIONAL: server-side 24h cleanup via pg_cron
-- (requires pg_cron extension enabled in Supabase — Settings →
--  Extensions → pg_cron. Free plan supports it.)
--
-- SELECT cron.schedule(
--   'delete-old-chat-messages',
--   '0 * * * *',   -- every hour
--   $$
--     DELETE FROM chat_messages
--     WHERE created_at < now() - interval '24 hours';
--   $$
-- );
-- ─────────────────────────────────────────────────────────────
