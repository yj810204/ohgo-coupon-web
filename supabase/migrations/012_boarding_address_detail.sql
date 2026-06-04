-- 승선명부 상세주소 분리 저장
ALTER TABLE boarding_info ADD COLUMN IF NOT EXISTS address_detail TEXT;
