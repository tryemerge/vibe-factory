PRAGMA foreign_keys = ON;

-- Add session_id column to task_attempts table
-- This will store session_id for Claude and thread_id for Amp
ALTER TABLE task_attempts ADD COLUMN session_id TEXT;
