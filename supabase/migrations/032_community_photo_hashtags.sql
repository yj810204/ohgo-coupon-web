-- 조황 글 해시태그. 본문과 따로 둔다. # 없이 저장한다.
ALTER TABLE community_photos
  ADD COLUMN IF NOT EXISTS hashtags TEXT[] NOT NULL DEFAULT '{}';
