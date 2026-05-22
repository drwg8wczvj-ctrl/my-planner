-- ─────────────────────────────────────────────────────────────
-- NORA — Database migrations
-- Run once in Supabase SQL Editor (safe to re-run)
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

DROP POLICY IF EXISTS "Users can manage own chat messages" ON chat_messages;
CREATE POLICY "Users can manage own chat messages"
  ON chat_messages FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS chat_messages_user_created
  ON chat_messages (user_id, created_at DESC);


-- 2. Persistent user preferences (never deleted)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb       NOT NULL DEFAULT '{}',
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own preferences" ON user_preferences;
CREATE POLICY "Users can manage own preferences"
  ON user_preferences FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 3. User profile — name, birthday, visible in Supabase dashboard
CREATE TABLE IF NOT EXISTS user_profile (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text,
  birthday   date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Safe column additions for existing tables
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS name     text;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profile_select" ON user_profile;
CREATE POLICY "user_profile_select"
  ON user_profile FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profile_insert" ON user_profile;
CREATE POLICY "user_profile_insert"
  ON user_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profile_update" ON user_profile;
CREATE POLICY "user_profile_update"
  ON user_profile FOR UPDATE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- OPTIONAL: server-side 24h cleanup via pg_cron
-- (requires pg_cron extension — Supabase Settings → Extensions)
--
-- SELECT cron.schedule(
--   'delete-old-chat-messages',
--   '0 * * * *',
--   $$ DELETE FROM chat_messages WHERE created_at < now() - interval '24 hours'; $$
-- );
-- ─────────────────────────────────────────────────────────────
