-- ============================================================
-- Migration: 001_production_hardening.sql
-- เรียกใช้: mysql -u root -p tigerlotto_db < migrations/001_production_hardening.sql
-- ============================================================

-- 1. เพิ่ม token_version สำหรับ invalidate tokens หลัง logout / change password
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0 AFTER referral_code;

-- 2. Performance indexes ที่ขาดอยู่
CREATE INDEX IF NOT EXISTS idx_transactions_user_id     ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions (type, status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at  ON transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_slips_user_id            ON slips (user_id);
CREATE INDEX IF NOT EXISTS idx_slips_round_id           ON slips (round_id);
CREATE INDEX IF NOT EXISTS idx_slips_status             ON slips (status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_otp_logs_phone           ON otp_logs (phone, created_at);
CREATE INDEX IF NOT EXISTS idx_commissions_agent_id     ON commissions (agent_id);

-- 3. เพิ่ม min_deposit setting ถ้ายังไม่มี
INSERT IGNORE INTO system_settings (`key`, value, group_name, description)
VALUES ('min_deposit', '100', 'wallet', 'ฝากเงินขั้นต่ำ (บาท)');

INSERT IGNORE INTO system_settings (`key`, value, group_name, description)
VALUES ('max_deposit', '100000', 'wallet', 'ฝากเงินสูงสุดต่อครั้ง (บาท)');
