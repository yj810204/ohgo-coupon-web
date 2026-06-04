-- community_photos Firebase 호환 필드
ALTER TABLE community_photos ADD COLUMN IF NOT EXISTS uploaded_by_name TEXT;
ALTER TABLE community_photos ADD COLUMN IF NOT EXISTS template_field_values JSONB;
ALTER TABLE community_photos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
