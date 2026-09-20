-- 커뮤니티 게시글 카테고리 (Q&A / FAQ)
ALTER TABLE community_photos
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS community_photos_board_category_idx
  ON community_photos (board_type, category, created_at DESC);
