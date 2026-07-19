ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_normalized TEXT;

CREATE TABLE IF NOT EXISTS account_identity_conflicts (
    email_normalized TEXT PRIMARY KEY,
    user_ids JSONB NOT NULL,
    detected_at BIGINT NOT NULL,
    resolved_at BIGINT
);

INSERT INTO account_identity_conflicts (email_normalized, user_ids, detected_at)
SELECT
    LOWER(BTRIM(email)),
    jsonb_agg(id ORDER BY id),
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM users
GROUP BY LOWER(BTRIM(email))
HAVING COUNT(*) > 1
ON CONFLICT (email_normalized) DO UPDATE
SET user_ids = EXCLUDED.user_ids,
    detected_at = EXCLUDED.detected_at;

UPDATE users target
SET email_normalized = LOWER(BTRIM(target.email))
WHERE target.email_normalized IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM account_identity_conflicts conflict
      WHERE conflict.email_normalized = LOWER(BTRIM(target.email))
        AND conflict.resolved_at IS NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_email_normalized
    ON users(email_normalized)
    WHERE email_normalized IS NOT NULL;

ALTER TABLE users
    ADD CONSTRAINT chk_users_email_normalized
    CHECK (
        email_normalized IS NULL
        OR (
            email_normalized = LOWER(BTRIM(email_normalized))
            AND octet_length(email_normalized) <= 254
        )
    ) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT chk_users_email_normalized;

ALTER TABLE email_verification_codes
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE email_verification_codes
    ADD CONSTRAINT chk_email_verification_status
    CHECK (status IN ('pending', 'sent', 'failed')) NOT VALID;
ALTER TABLE email_verification_codes VALIDATE CONSTRAINT chk_email_verification_status;
CREATE INDEX IF NOT EXISTS idx_email_codes_sent_cooldown
    ON email_verification_codes(email, purpose, ctime DESC)
    WHERE status = 'sent';

CREATE TABLE IF NOT EXISTS oauth_one_time_tokens (
    kind TEXT NOT NULL,
    digest TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL,
    provider TEXT NOT NULL,
    user_id TEXT,
    email_normalized TEXT,
    return_to TEXT NOT NULL DEFAULT '',
    expires_at BIGINT NOT NULL,
    consumed_at BIGINT,
    ctime BIGINT NOT NULL,
    PRIMARY KEY (kind, digest),
    CONSTRAINT chk_oauth_one_time_kind CHECK (kind IN ('state', 'exchange')),
    CONSTRAINT chk_oauth_one_time_expiry CHECK (expires_at > ctime),
    CONSTRAINT fk_oauth_one_time_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_one_time_expiry
    ON oauth_one_time_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_one_time_active
    ON oauth_one_time_tokens(kind, digest, expires_at)
    WHERE consumed_at IS NULL;
