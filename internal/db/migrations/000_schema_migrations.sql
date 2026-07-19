CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL,
    applied_at BIGINT NOT NULL
);

DO $mnote$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations)
       AND EXISTS (
           SELECT 1
           FROM pg_catalog.pg_tables
           WHERE schemaname = current_schema()
             AND tablename <> 'schema_migrations'
       )
    THEN
        RAISE EXCEPTION
            USING ERRCODE = '55000',
                  MESSAGE = 'unmanaged non-empty schema; restore the verified migration ledger before upgrade';
    END IF;
END
$mnote$;
