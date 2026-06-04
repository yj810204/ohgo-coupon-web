CREATE TABLE IF NOT EXISTS qr_codes (
  code TEXT PRIMARY KEY,
  label TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY qr_codes_read ON qr_codes FOR SELECT USING (true);
CREATE POLICY qr_codes_admin ON qr_codes FOR ALL USING (public.is_admin());

INSERT INTO qr_codes (code, label)
VALUES ('OHGO-STAMP-BOAT19033326262005', '보트 기본 QR')
ON CONFLICT (code) DO NOTHING;
