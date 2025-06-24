PRAGMA foreign_keys = ON;

-- The task_attempt_activities table doesn't have CHECK constraints in the current schema
-- (as seen in the 20250621120000 migration), so we don't need to modify constraints.
-- The status values are managed by the Rust enum serialization.
-- This is just a placeholder migration to maintain migration order.
