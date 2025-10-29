-- Add worktree_dir column to projects table
-- This allows per-project customization of where git worktrees are stored
ALTER TABLE projects ADD COLUMN worktree_dir TEXT DEFAULT NULL;
