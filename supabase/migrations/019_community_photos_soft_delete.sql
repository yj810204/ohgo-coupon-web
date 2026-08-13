-- 작성자 삭제 시 댓글 유지용 소프트 삭제 플래그
ALTER TABLE community_photos
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE community_photos
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
