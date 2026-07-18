-- BE-5: Saved Views feature has been removed end-to-end. Drop the table to
-- stop accruing dead rows and reclaim the index storage. The historical
-- 003_saved_views.sql file is preserved so this migrator can still process
-- a fresh install in original order; this DROP runs after 005_todos so any
-- environment that ran 003 cleanly will end up with the same final shape.
--
-- Rollback note: re-running 003_saved_views.sql will recreate an empty
-- saved_views table; there is no data to restore because the feature is
-- being deprecated, not paused.

DROP TABLE IF EXISTS saved_views;
