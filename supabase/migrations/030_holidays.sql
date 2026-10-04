-- 연도별 공휴일 (한국천문연구원 특일정보). /api/holidays 가 서비스 롤로 읽고 쓴다.
-- holidays: [{ "date": "YYYY-MM-DD", "name": "설날" }, ...]

CREATE TABLE IF NOT EXISTS holidays (
  year INT PRIMARY KEY,
  holidays JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS holidays_read ON holidays;
CREATE POLICY holidays_read ON holidays FOR SELECT USING (true);

DROP POLICY IF EXISTS holidays_admin ON holidays;
CREATE POLICY holidays_admin ON holidays FOR ALL USING (public.is_admin());
