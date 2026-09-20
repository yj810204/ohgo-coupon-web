-- 커뮤니티 게시판 종류 (조황 사진 / 낚시 Q&A)
ALTER TABLE community_photos
  ADD COLUMN IF NOT EXISTS board_type TEXT NOT NULL DEFAULT 'photo';

UPDATE community_photos
SET board_type = 'photo'
WHERE board_type IS NULL OR board_type = '';

CREATE INDEX IF NOT EXISTS community_photos_board_type_created_idx
  ON community_photos (board_type, created_at DESC);

ALTER TABLE community_photos ALTER COLUMN image_urls DROP NOT NULL;
