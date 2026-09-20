-- Q&A 답변 선정
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE community_photos
  ADD COLUMN IF NOT EXISTS accepted_comment_id UUID REFERENCES comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS comments_photo_accepted_idx
  ON comments (photo_id, is_accepted);

CREATE UNIQUE INDEX IF NOT EXISTS comments_one_accepted_per_photo
  ON comments (photo_id)
  WHERE is_accepted = true;
