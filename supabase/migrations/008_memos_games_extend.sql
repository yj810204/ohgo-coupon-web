-- 회원 메모
CREATE TABLE IF NOT EXISTS user_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_memos_user ON user_memos(user_id);

ALTER TABLE user_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_memos_own ON user_memos FOR ALL USING (
  auth.uid() = user_id OR public.is_admin()
);

-- games Firebase 호환 컬럼
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_description TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS config_data TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 게임 점수 기록
CREATE TABLE IF NOT EXISTS game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  score INT NOT NULL,
  points INT NOT NULL DEFAULT 0,
  level INT,
  moves INT,
  time_seconds INT,
  extra_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores(user_id);

ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_scores_own ON game_scores FOR ALL USING (
  auth.uid() = user_id OR public.is_admin()
);
