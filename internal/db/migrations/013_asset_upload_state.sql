ALTER TABLE assets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS locked_until BIGINT NOT NULL DEFAULT 0;

ALTER TABLE assets
    ADD CONSTRAINT chk_assets_status
    CHECK (status IN ('pending', 'ready', 'failed')) NOT VALID;
ALTER TABLE assets VALIDATE CONSTRAINT chk_assets_status;

CREATE INDEX IF NOT EXISTS idx_assets_user_status_mtime
    ON assets(user_id, status, mtime DESC);
CREATE INDEX IF NOT EXISTS idx_assets_cleanup
    ON assets(status, locked_until, mtime, id);
