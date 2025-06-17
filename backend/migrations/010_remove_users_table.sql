-- Remove users table and all references to it

-- Drop the trigger on users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- Drop indexes related to users
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_is_admin;

-- Drop the foreign key constraint and column from projects table
ALTER TABLE projects DROP CONSTRAINT projects_owner_id_fkey;
DROP INDEX IF EXISTS idx_projects_owner_id;
ALTER TABLE projects DROP COLUMN owner_id;

-- Drop the users table
DROP TABLE IF EXISTS users;
