-- 게시판 공지 고정
ALTER TABLE community_photos
  ADD COLUMN IF NOT EXISTS is_notice BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS community_photos_board_notice_idx
  ON community_photos (board_type, is_notice DESC, created_at DESC);
