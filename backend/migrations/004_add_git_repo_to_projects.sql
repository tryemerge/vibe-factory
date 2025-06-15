-- Add git repository fields to projects table

-- Create git provider enum
CREATE TYPE git_provider AS ENUM ('github', 'gitlab', 'bitbucket', 'other');

-- Create git credential type enum  
CREATE TYPE git_credential_type AS ENUM ('token', 'ssh_key', 'oauth');

-- Create git_credentials table
CREATE TABLE git_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    credential_type git_credential_type NOT NULL,
    encrypted_credential TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add git repository fields to projects table
ALTER TABLE projects 
ADD COLUMN repo_url VARCHAR(500) NOT NULL DEFAULT '',
ADD COLUMN repo_provider git_provider NOT NULL DEFAULT 'github',
ADD COLUMN git_credential_id UUID REFERENCES git_credentials(id);

-- Remove default values since these should be provided during creation
ALTER TABLE projects 
ALTER COLUMN repo_url DROP DEFAULT,
ALTER COLUMN repo_provider DROP DEFAULT;

-- Create indexes
CREATE INDEX idx_git_credentials_user_id ON git_credentials(user_id);
CREATE INDEX idx_projects_git_credential_id ON projects(git_credential_id);

-- Add trigger for git_credentials updated_at
CREATE TRIGGER update_git_credentials_updated_at 
    BEFORE UPDATE ON git_credentials 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
