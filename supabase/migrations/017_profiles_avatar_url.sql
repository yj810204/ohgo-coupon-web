-- 프로필 이미지 URL
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
