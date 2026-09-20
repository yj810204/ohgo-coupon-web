-- 대댓글(parent_id). 부모 삭제 시 자식도 함께 삭제
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON comments(parent_id);
