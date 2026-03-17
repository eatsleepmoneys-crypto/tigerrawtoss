-- ============================================================
--  TigerLotto — Database Schema
--  MySQL 8.0+ / MariaDB 10.6+
--  Generated: 2026-03-15
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. USERS — สมาชิก
-- ============================================================
CREATE TABLE users (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid          CHAR(36)        NOT NULL UNIQUE DEFAULT (UUID()),
    phone         VARCHAR(20)     NOT NULL UNIQUE,
    email         VARCHAR(255)    UNIQUE,
    password_hash VARCHAR(255)    NOT NULL,
    first_name    VARCHAR(100)    NOT NULL,
    last_name     VARCHAR(100)    NOT NULL,
    display_name  VARCHAR(100),
    avatar_url    VARCHAR(500),
    role          ENUM('member','agent','sub_agent','admin','superadmin') NOT NULL DEFAULT 'member',
    vip_tier      ENUM('bronze','silver','gold','platinum','diamond')     NOT NULL DEFAULT 'bronze',
    vip_points    INT UNSIGNED    NOT NULL DEFAULT 0,
    referral_code VARCHAR(20)     NOT NULL UNIQUE,
    referred_by   BIGINT UNSIGNED,
    is_verified   TINYINT(1)      NOT NULL DEFAULT 0,
    is_active     TINYINT(1)      NOT NULL DEFAULT 1,
    is_banned     TINYINT(1)      NOT NULL DEFAULT 0,
    last_login_at DATETIME,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. USER_KYC — ยืนยันตัวตน
-- ============================================================
CREATE TABLE user_kyc (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id        BIGINT UNSIGNED NOT NULL UNIQUE,
    id_card_number VARCHAR(20)     NOT NULL,
    id_card_image  VARCHAR(500),
    selfie_image   VARCHAR(500),
    status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reviewed_by    BIGINT UNSIGNED,
    reviewed_at    DATETIME,
    reject_reason  VARCHAR(500),
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. USER_BANK_ACCOUNTS — บัญชีธนาคาร
-- ============================================================
CREATE TABLE user_bank_accounts (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id        BIGINT UNSIGNED NOT NULL,
    bank_code      VARCHAR(20)     NOT NULL,   -- e.g. 'KBANK','KTB','SCB'
    bank_name      VARCHAR(100)    NOT NULL,
    account_number VARCHAR(20)     NOT NULL,
    account_name   VARCHAR(200)    NOT NULL,
    is_default     TINYINT(1)      NOT NULL DEFAULT 0,
    is_verified    TINYINT(1)      NOT NULL DEFAULT 0,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_bank (user_id, account_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. WALLETS — กระเป๋าเงิน
-- ============================================================
CREATE TABLE wallets (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL UNIQUE,
    balance         DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    bonus_balance   DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    locked_balance  DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    total_deposit   DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    total_withdraw  DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    total_won       DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    total_bet       DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. TRANSACTIONS — ธุรกรรมการเงิน
-- ============================================================
CREATE TABLE transactions (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ref_no          VARCHAR(30)     NOT NULL UNIQUE,
    user_id         BIGINT UNSIGNED NOT NULL,
    type            ENUM('deposit','withdraw','bet','win','bonus','commission','refund') NOT NULL,
    amount          DECIMAL(15,2)   NOT NULL,
    fee             DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    balance_before  DECIMAL(15,2)   NOT NULL,
    balance_after   DECIMAL(15,2)   NOT NULL,
    payment_method  VARCHAR(50),    -- 'qr_promptpay','bank_transfer','truemoney'
    bank_account_id BIGINT UNSIGNED,
    slip_image      VARCHAR(500),
    status          ENUM('pending','processing','success','failed','cancelled') NOT NULL DEFAULT 'pending',
    note            TEXT,
    processed_by    BIGINT UNSIGNED,
    processed_at    DATETIME,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (bank_account_id) REFERENCES user_bank_accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_type (user_id, type),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. LOTTERY_TYPES — ประเภทหวย
-- ============================================================
CREATE TABLE lottery_types (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code         VARCHAR(30)  NOT NULL UNIQUE,   -- 'gov','yeekee','set','hanoi','laos'
    name         VARCHAR(100) NOT NULL,
    icon         VARCHAR(10),
    description  TEXT,
    schedule     VARCHAR(200),                   -- cron or description
    rounds_per_day INT UNSIGNED NOT NULL DEFAULT 1,
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order   INT          NOT NULL DEFAULT 0,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. BET_TYPES — ประเภทการแทง + อัตราจ่าย
-- ============================================================
CREATE TABLE bet_types (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    lottery_type_id  INT UNSIGNED NOT NULL,
    code             VARCHAR(30)  NOT NULL,   -- '3_top','3_tod','2_top','2_bot','run_top'
    name             VARCHAR(100) NOT NULL,
    digits           TINYINT      NOT NULL,   -- 1, 2, 3, 4, 5, 6
    payout_rate      DECIMAL(10,2) NOT NULL,  -- อัตราจ่ายต่อบาท
    min_bet          DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    max_bet          DECIMAL(10,2) NOT NULL DEFAULT 5000.00,
    is_active        TINYINT(1)   NOT NULL DEFAULT 1,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (lottery_type_id) REFERENCES lottery_types(id),
    UNIQUE KEY uq_lt_code (lottery_type_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. LOTTERY_ROUNDS — งวดหวย
-- ============================================================
CREATE TABLE lottery_rounds (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    lottery_type_id  INT UNSIGNED    NOT NULL,
    round_code       VARCHAR(50)     NOT NULL UNIQUE,  -- 'GOV-2026-03-16','YK-2026-03-15-14:30'
    round_name       VARCHAR(200)    NOT NULL,
    open_at          DATETIME        NOT NULL,
    close_at         DATETIME        NOT NULL,
    result_at        DATETIME,
    status           ENUM('upcoming','open','closed','resulted','cancelled') NOT NULL DEFAULT 'upcoming',
    total_bet_amount DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    total_payout     DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    created_by       BIGINT UNSIGNED,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lottery_type_id) REFERENCES lottery_types(id),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_close_at (close_at),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. LOTTERY_RESULTS — ผลรางวัล
-- ============================================================
CREATE TABLE lottery_results (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    round_id        BIGINT UNSIGNED NOT NULL UNIQUE,
    result_first    VARCHAR(10),    -- รางวัลที่ 1 (6 หลัก)
    result_3_front1 VARCHAR(5),
    result_3_front2 VARCHAR(5),
    result_3_back1  VARCHAR(5),
    result_3_back2  VARCHAR(5),
    result_2_back   VARCHAR(3),
    result_raw      JSON,           -- เก็บผลดิบทั้งหมด
    source          VARCHAR(200),   -- แหล่งที่มาของผล
    entered_by      BIGINT UNSIGNED,
    entered_at      DATETIME,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round_id) REFERENCES lottery_rounds(id),
    FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. SLIPS — โพยหวย (header)
-- ============================================================
CREATE TABLE slips (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slip_no       VARCHAR(30)     NOT NULL UNIQUE,   -- SL-20260315-000001
    user_id       BIGINT UNSIGNED NOT NULL,
    round_id      BIGINT UNSIGNED NOT NULL,
    total_amount  DECIMAL(15,2)   NOT NULL,
    total_payout  DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    status        ENUM('pending','active','closed','cancelled','won','lost') NOT NULL DEFAULT 'active',
    cancelled_at  DATETIME,
    cancel_reason VARCHAR(500),
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (round_id) REFERENCES lottery_rounds(id),
    INDEX idx_user_round (user_id, round_id),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. SLIP_ITEMS — รายการเลขในโพย
-- ============================================================
CREATE TABLE slip_items (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slip_id      BIGINT UNSIGNED NOT NULL,
    bet_type_id  INT UNSIGNED    NOT NULL,
    number       VARCHAR(10)     NOT NULL,
    amount       DECIMAL(10,2)   NOT NULL,
    payout_rate  DECIMAL(10,2)   NOT NULL,
    win_amount   DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    is_win       TINYINT(1),                 -- NULL=รอผล, 1=ถูก, 0=ไม่ถูก
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (slip_id) REFERENCES slips(id) ON DELETE CASCADE,
    FOREIGN KEY (bet_type_id) REFERENCES bet_types(id),
    INDEX idx_slip (slip_id),
    INDEX idx_number (number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. HOT_NUMBERS — เลขยอดนิยม (aggregated cache)
-- ============================================================
CREATE TABLE hot_numbers (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    lottery_type_id INT UNSIGNED    NOT NULL,
    bet_type_id     INT UNSIGNED    NOT NULL,
    round_id        BIGINT UNSIGNED NOT NULL,
    number          VARCHAR(10)     NOT NULL,
    bet_count       INT UNSIGNED    NOT NULL DEFAULT 0,
    total_amount    DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    max_payout      DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (lottery_type_id) REFERENCES lottery_types(id),
    FOREIGN KEY (bet_type_id) REFERENCES bet_types(id),
    FOREIGN KEY (round_id) REFERENCES lottery_rounds(id),
    UNIQUE KEY uq_round_num (round_id, bet_type_id, number),
    INDEX idx_amount (total_amount DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. PROMOTIONS — โปรโมชั่น
-- ============================================================
CREATE TABLE promotions (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code         VARCHAR(50)  NOT NULL UNIQUE,
    name         VARCHAR(200) NOT NULL,
    type         ENUM('bonus','cashback','referral','deposit','special') NOT NULL,
    description  TEXT,
    value        VARCHAR(50)  NOT NULL,   -- '฿50' or '30%'
    icon         VARCHAR(10),
    max_amount   DECIMAL(10,2),
    min_deposit  DECIMAL(10,2),
    start_at     DATETIME,
    end_at       DATETIME,
    is_featured  TINYINT(1)   NOT NULL DEFAULT 0,
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    usage_count  INT UNSIGNED NOT NULL DEFAULT 0,
    usage_limit  INT UNSIGNED,
    created_by   BIGINT UNSIGNED,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. USER_PROMOTIONS — การใช้โปรโมชั่น
-- ============================================================
CREATE TABLE user_promotions (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id        BIGINT UNSIGNED NOT NULL,
    promotion_id   INT UNSIGNED    NOT NULL,
    transaction_id BIGINT UNSIGNED,
    amount_received DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    claimed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (promotion_id) REFERENCES promotions(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. AGENTS — ตัวแทน
-- ============================================================
CREATE TABLE agents (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL UNIQUE,
    parent_agent_id BIGINT UNSIGNED,
    level           TINYINT         NOT NULL DEFAULT 1,   -- 1=Agent, 2=Sub-Agent
    agent_code      VARCHAR(20)     NOT NULL UNIQUE,
    commission_l1   DECIMAL(5,4)    NOT NULL DEFAULT 0.0100,  -- 1%
    commission_l2   DECIMAL(5,4)    NOT NULL DEFAULT 0.0050,  -- 0.5%
    commission_l3   DECIMAL(5,4)    NOT NULL DEFAULT 0.0030,  -- 0.3%
    total_commission DECIMAL(15,2)  NOT NULL DEFAULT 0.00,
    member_count    INT UNSIGNED    NOT NULL DEFAULT 0,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. COMMISSIONS — รายได้ค่าแนะนำ
-- ============================================================
CREATE TABLE commissions (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    agent_id       BIGINT UNSIGNED NOT NULL,
    source_user_id BIGINT UNSIGNED NOT NULL,
    slip_id        BIGINT UNSIGNED NOT NULL,
    level          TINYINT         NOT NULL,
    bet_amount     DECIMAL(15,2)   NOT NULL,
    rate           DECIMAL(5,4)    NOT NULL,
    amount         DECIMAL(15,2)   NOT NULL,
    status         ENUM('pending','paid') NOT NULL DEFAULT 'pending',
    paid_at        DATETIME,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    FOREIGN KEY (source_user_id) REFERENCES users(id),
    FOREIGN KEY (slip_id) REFERENCES slips(id),
    INDEX idx_agent (agent_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 17. NOTIFICATIONS — การแจ้งเตือน
-- ============================================================
CREATE TABLE notifications (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL,
    type       ENUM('win','deposit','withdraw','promo','system','otp') NOT NULL,
    title      VARCHAR(200)    NOT NULL,
    body       TEXT            NOT NULL,
    data       JSON,
    is_read    TINYINT(1)      NOT NULL DEFAULT 0,
    read_at    DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 18. OTP_LOGS — ประวัติ OTP
-- ============================================================
CREATE TABLE otp_logs (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED,
    phone      VARCHAR(20)     NOT NULL,
    otp_code   VARCHAR(10)     NOT NULL,
    purpose    ENUM('register','login','withdraw','reset_password') NOT NULL,
    is_used    TINYINT(1)      NOT NULL DEFAULT 0,
    expires_at DATETIME        NOT NULL,
    used_at    DATETIME,
    ip_address VARCHAR(45),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_phone_purpose (phone, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 19. SYSTEM_SETTINGS — ตั้งค่าระบบ
-- ============================================================
CREATE TABLE system_settings (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `key`       VARCHAR(100) NOT NULL UNIQUE,
    value       TEXT         NOT NULL,
    type        ENUM('string','integer','decimal','boolean','json') NOT NULL DEFAULT 'string',
    group_name  VARCHAR(50),
    description VARCHAR(500),
    updated_by  BIGINT UNSIGNED,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 20. API_KEYS — จัดการ API Key
-- ============================================================
CREATE TABLE api_keys (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL UNIQUE,
    service_code VARCHAR(50)  NOT NULL UNIQUE,
    api_key      TEXT         NOT NULL,   -- encrypted
    api_secret   TEXT,                   -- encrypted
    extra_config JSON,
    environment  ENUM('production','staging','development') NOT NULL DEFAULT 'production',
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    last_used_at DATETIME,
    updated_by   BIGINT UNSIGNED,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 21. AUDIT_LOGS — ประวัติการกระทำ Admin
-- ============================================================
CREATE TABLE audit_logs (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT UNSIGNED,
    action       VARCHAR(100)   NOT NULL,
    target_table VARCHAR(100),
    target_id    BIGINT UNSIGNED,
    old_value    JSON,
    new_value    JSON,
    ip_address   VARCHAR(45),
    user_agent   VARCHAR(500),
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SEED DATA — ข้อมูลเริ่มต้น
-- ============================================================

-- ประเภทหวย
INSERT INTO lottery_types (code, name, icon, rounds_per_day, sort_order) VALUES
('gov',    'หวยรัฐบาลไทย', '🇹🇭', 2,  1),
('yeekee', 'หวยยี่กี 24ชม.', '⚡', 90, 2),
('set',    'หวยหุ้น SET',   '📈', 2,  3),
('hanoi',  'หวยฮานอย',     '🌏', 1,  4),
('laos',   'หวยลาว',        '🇱🇦', 1,  5);

-- อัตราจ่ายหวยรัฐบาล
INSERT INTO bet_types (lottery_type_id, code, name, digits, payout_rate, max_bet) VALUES
(1,'3_top',    '3 ตัวบน',    3, 750.00, 5000),
(1,'3_bot',    '3 ตัวล่าง',  3, 450.00, 5000),
(1,'3_tod',    '3 โต๊ด',      3, 120.00, 10000),
(1,'3_front',  '3 ตัวหน้า',  3, 550.00, 5000),
(1,'2_top',    '2 ตัวบน',    2, 75.00,  5000),
(1,'2_bot',    '2 ตัวล่าง',  2, 75.00,  5000),
(1,'2_mid',    '2 ตัวกลาง',  2, 75.00,  5000),
(1,'run_top',  'วิ่งบน',      1, 3.20,   20000),
(1,'run_bot',  'วิ่งล่าง',    1, 4.20,   20000);

-- อัตราจ่ายยี่กี
INSERT INTO bet_types (lottery_type_id, code, name, digits, payout_rate, max_bet) VALUES
(2,'3_top',   '3 ตัวบน',  3, 700.00, 5000),
(2,'3_tod',   '3 โต๊ด',    3, 115.00, 10000),
(2,'2_top',   '2 ตัวบน',  2, 70.00,  5000),
(2,'2_bot',   '2 ตัวล่าง',2, 70.00,  5000),
(2,'run_top', 'วิ่งบน',    1, 3.00,   20000),
(2,'run_bot', 'วิ่งล่าง',  1, 4.00,   20000);

-- ตั้งค่าระบบ
INSERT INTO system_settings (`key`, value, type, group_name, description) VALUES
('maintenance_mode',    '0',        'boolean', 'system',  'เปิด/ปิด Maintenance Mode'),
('auto_deposit',        '1',        'boolean', 'payment', 'รับฝากอัตโนมัติ'),
('min_withdraw',        '100',      'decimal', 'payment', 'ถอนขั้นต่ำ (บาท)'),
('max_withdraw',        '50000',    'decimal', 'payment', 'ถอนสูงสุดต่อครั้ง (บาท)'),
('cancel_window_mins',  '30',       'integer', 'betting', 'เวลาที่ยกเลิกโพยได้ก่อนปิดรับ (นาที)'),
('risk_alert_amount',   '50000',    'decimal', 'risk',    'แจ้งเตือนเมื่อยอดซื้อต่อเลขเกิน'),
('risk_close_amount',   '100000',   'decimal', 'risk',    'ปิดรับอัตโนมัติเมื่อเกิน'),
('bonus_welcome',       '50',       'decimal', 'promo',   'โบนัสสมัครใหม่ (บาท)'),
('commission_l1',       '0.01',     'decimal', 'agent',   'Commission Level 1'),
('commission_l2',       '0.005',    'decimal', 'agent',   'Commission Level 2'),
('commission_l3',       '0.003',    'decimal', 'agent',   'Commission Level 3');
