use std::path::{Path, PathBuf};

use git2::{
    BranchType, DiffOptions, Error as GitError, RebaseOptions, Repository, WorktreeAddOptions,
};
use tracing::{debug, info};

use crate::models::task_attempt::{BranchStatus, FileDiff, WorktreeDiff};

#[derive(Debug)]
pub enum GitServiceError {
    Git(GitError),
    IoError(std::io::Error),
    InvalidRepository(String),
    BranchNotFound(String),
    WorktreeExists(String),
    MergeConflicts(String),
    InvalidPath(String),
}

impl std::fmt::Display for GitServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitServiceError::Git(e) => write!(f, "Git error: {}", e),
            GitServiceError::IoError(e) => write!(f, "IO error: {}", e),
            GitServiceError::InvalidRepository(e) => write!(f, "Invalid repository: {}", e),
            GitServiceError::BranchNotFound(e) => write!(f, "Branch not found: {}", e),
            GitServiceError::WorktreeExists(e) => write!(f, "Worktree already exists: {}", e),
            GitServiceError::MergeConflicts(e) => write!(f, "Merge conflicts: {}", e),
            GitServiceError::InvalidPath(e) => write!(f, "Invalid path: {}", e),
        }
    }
}

impl std::error::Error for GitServiceError {}

impl From<GitError> for GitServiceError {
    fn from(err: GitError) -> Self {
        GitServiceError::Git(err)
    }
}

impl From<std::io::Error> for GitServiceError {
    fn from(err: std::io::Error) -> Self {
        GitServiceError::IoError(err)
    }
}

/// Service for managing Git operations in task execution workflows
pub struct GitService {
    repo_path: PathBuf,
}

impl GitService {
    /// Create a new GitService for the given repository path
    pub fn new<P: AsRef<Path>>(repo_path: P) -> Result<Self, GitServiceError> {
        let repo_path = repo_path.as_ref().to_path_buf();
        
        // Validate that the path exists and is a git repository
        if !repo_path.exists() {
            return Err(GitServiceError::InvalidPath(format!(
                "Repository path does not exist: {}",
                repo_path.display()
            )));
        }

        // Try to open the repository to validate it
        Repository::open(&repo_path).map_err(|e| {
            GitServiceError::InvalidRepository(format!(
                "Failed to open repository at {}: {}",
                repo_path.display(),
                e
            ))
        })?;

        Ok(Self { repo_path })
    }

    /// Open the repository
    fn open_repo(&self) -> Result<Repository, GitServiceError> {
        Repository::open(&self.repo_path).map_err(GitServiceError::from)
    }

    /// Create a worktree with a new branch
    pub fn create_worktree(
        &self,
        branch_name: &str,
        worktree_path: &Path,
        base_branch: Option<&str>,
    ) -> Result<(), GitServiceError> {
        let repo = self.open_repo()?;
        
        // Ensure parent directory exists
        if let Some(parent) = worktree_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Choose base reference
        let base_reference = if let Some(base_branch) = base_branch {
            let branch = repo.find_branch(base_branch, BranchType::Local)
                .map_err(|_| GitServiceError::BranchNotFound(base_branch.to_string()))?;
            branch.into_reference()
        } else {
            // Handle new repositories without any commits
            match repo.head() {
                Ok(head_ref) => head_ref,
                Err(e) if e.class() == git2::ErrorClass::Reference 
                    && e.code() == git2::ErrorCode::UnbornBranch => {
                    // Repository has no commits yet, create an initial commit
                    self.create_initial_commit(&repo)?;
                    repo.find_reference("refs/heads/main")?
                }
                Err(e) => return Err(e.into()),
            }
        };

        // Create branch
        repo.branch(branch_name, &base_reference.peel_to_commit()?, false)?;

        let branch = repo.find_branch(branch_name, BranchType::Local)?;
        let branch_ref = branch.into_reference();
        let mut worktree_opts = WorktreeAddOptions::new();
        worktree_opts.reference(Some(&branch_ref));

        // Create the worktree at the specified path
        repo.worktree(branch_name, worktree_path, Some(&worktree_opts))?;

        info!("Created worktree '{}' at path: {}", branch_name, worktree_path.display());
        Ok(())
    }

    /// Create an initial commit for empty repositories
    fn create_initial_commit(&self, repo: &Repository) -> Result<(), GitServiceError> {
        let signature = repo.signature().unwrap_or_else(|_| {
            // Fallback if no Git config is set
            git2::Signature::now("Vibe Kanban", "noreply@vibekanban.com")
                .expect("Failed to create fallback signature")
        });
        
        let tree_id = {
            let tree_builder = repo.treebuilder(None)?;
            tree_builder.write()?
        };
        let tree = repo.find_tree(tree_id)?;

        // Create initial commit on main branch
        let _commit_id = repo.commit(
            Some("refs/heads/main"),
            &signature,
            &signature,
            "Initial commit",
            &tree,
            &[],
        )?;

        // Set HEAD to point to main branch
        repo.set_head("refs/heads/main")?;

        info!("Created initial commit for empty repository");
        Ok(())
    }

    /// Merge changes from a worktree branch back to the main repository
    pub fn merge_changes(
        &self,
        worktree_path: &Path,
        branch_name: &str,
        task_title: &str,
    ) -> Result<String, GitServiceError> {
        let main_repo = self.open_repo()?;
        
        // Open the worktree repository to get the latest commit
        let worktree_repo = Repository::open(worktree_path)?;
        let worktree_head = worktree_repo.head()?;
        let worktree_commit = worktree_head.peel_to_commit()?;

        // Verify the branch exists in the main repo
        main_repo
            .find_branch(branch_name, BranchType::Local)
            .map_err(|_| GitServiceError::BranchNotFound(branch_name.to_string()))?;

        // Get the current HEAD of the main repo (usually main/master)
        let main_head = main_repo.head()?;
        let main_commit = main_head.peel_to_commit()?;

        // Get the signature for the merge commit
        let signature = main_repo.signature()?;

        // Get the tree from the worktree commit and find it in the main repo
        let worktree_tree_id = worktree_commit.tree_id();
        let main_tree = main_repo.find_tree(worktree_tree_id)?;

        // Find the worktree commit in the main repo
        let main_worktree_commit = main_repo.find_commit(worktree_commit.id())?;

        // Create a merge commit
        let merge_commit_id = main_repo.commit(
            Some("HEAD"),                                    // Update HEAD
            &signature,                                      // Author
            &signature,                                      // Committer
            &format!("Merge: {} (vibe-kanban)", task_title), // Message using task title
            &main_tree,                                      // Use the tree from main repo
            &[&main_commit, &main_worktree_commit], // Parents: main HEAD and worktree commit
        )?;

        info!("Created merge commit: {}", merge_commit_id);
        Ok(merge_commit_id.to_string())
    }

    /// Rebase a worktree branch onto a new base
    pub fn rebase_branch(
        &self,
        worktree_path: &Path,
        new_base_branch: Option<&str>,
    ) -> Result<String, GitServiceError> {
        let worktree_repo = Repository::open(worktree_path)?;
        let main_repo = self.open_repo()?;

        // Get the target base branch reference
        let base_branch_name = match new_base_branch {
            Some(branch) => branch.to_string(),
            None => {
                main_repo
                    .head()
                    .ok()
                    .and_then(|head| head.shorthand().map(|s| s.to_string()))
                    .unwrap_or_else(|| "main".to_string())
            }
        };
        let base_branch_name = base_branch_name.as_str();

        // Check if the specified base branch exists in the main repo
        let base_branch = main_repo
            .find_branch(&base_branch_name, BranchType::Local)
            .map_err(|_| GitServiceError::BranchNotFound(base_branch_name.to_string()))?;

        let base_commit_id = base_branch.get().peel_to_commit()?.id();

        // Get the HEAD commit of the worktree (the changes to rebase)
        let head = worktree_repo.head()?;

        // Set up rebase
        let mut rebase_opts = RebaseOptions::new();
        let signature = worktree_repo.signature()?;

        // Start the rebase
        let head_annotated = worktree_repo.reference_to_annotated_commit(&head)?;
        let base_annotated = worktree_repo.find_annotated_commit(base_commit_id)?;

        let mut rebase = worktree_repo.rebase(
            Some(&head_annotated),
            Some(&base_annotated),
            None, // onto (use upstream if None)
            Some(&mut rebase_opts),
        )?;

        // Process each rebase operation
        while let Some(operation) = rebase.next() {
            let _operation = operation?;

            // Check for conflicts
            let index = worktree_repo.index()?;
            if index.has_conflicts() {
                // For now, abort the rebase on conflicts
                rebase.abort()?;
                return Err(GitServiceError::MergeConflicts(
                    "Rebase failed due to conflicts. Please resolve conflicts manually.".to_string(),
                ));
            }

            // Commit the rebased operation
            rebase.commit(None, &signature, None)?;
        }

        // Finish the rebase
        rebase.finish(None)?;

        // Get the final commit ID after rebase
        let final_head = worktree_repo.head()?;
        let final_commit = final_head.peel_to_commit()?;

        info!("Rebase completed. New HEAD: {}", final_commit.id());
        Ok(final_commit.id().to_string())
    }

    /// Get diff between worktree and its base branch
    pub fn get_diff(&self, worktree_path: &Path) -> Result<WorktreeDiff, GitServiceError> {
        let worktree_repo = Repository::open(worktree_path)?;
        
        // Get the current commit
        let head = worktree_repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;

        // Get the index and working directory tree
        let mut index = worktree_repo.index()?;
        let index_tree_id = index.write_tree()?;
        let _index_tree = worktree_repo.find_tree(index_tree_id)?;

        // Create diff options
        let mut diff_opts = DiffOptions::new();
        diff_opts.include_untracked(true);

        // Get diff between HEAD and index + working directory
        let diff = worktree_repo.diff_tree_to_workdir(Some(&head_tree), Some(&mut diff_opts))?;

        let mut files = Vec::new();

        // Simplified diff processing - collect file changes first
        diff.foreach(
            &mut |delta, _progress| {
                let file_path = delta.new_file().path().unwrap_or_else(|| {
                    delta.old_file().path().unwrap_or(Path::new("unknown"))
                });
                
                let file_diff = FileDiff {
                    path: file_path.to_string_lossy().to_string(),
                    chunks: Vec::new(), // Simplified for now
                };
                files.push(file_diff);
                true
            },
            None,
            None,
            None, // Skip line-by-line processing for now to avoid borrow issues
        )?;

        Ok(WorktreeDiff { files })
    }

    /// Delete a file from the repository
    pub fn delete_file(&self, worktree_path: &Path, file_path: &str) -> Result<(), GitServiceError> {
        let worktree_repo = Repository::open(worktree_path)?;
        let mut index = worktree_repo.index()?;

        // Remove the file from the index
        index.remove_path(Path::new(file_path))?;
        index.write()?;

        // Also delete the file from the working directory if it exists
        let full_file_path = worktree_path.join(file_path);
        if full_file_path.exists() {
            std::fs::remove_file(full_file_path)?;
        }

        debug!("Deleted file: {}", file_path);
        Ok(())
    }

    /// Get the status of a branch relative to its base branch
    pub fn get_branch_status(
        &self,
        worktree_path: &Path,
        base_branch_name: &str,
    ) -> Result<BranchStatus, GitServiceError> {
        let worktree_repo = Repository::open(worktree_path)?;
        let main_repo = self.open_repo()?;

        // Get the current HEAD commit
        let head = worktree_repo.head()?;
        let head_commit = head.peel_to_commit()?;

        // Get the base branch commit from the main repo
        let base_branch = main_repo
            .find_branch(base_branch_name, BranchType::Local)
            .map_err(|_| GitServiceError::BranchNotFound(base_branch_name.to_string()))?;
        let base_commit = base_branch.get().peel_to_commit()?;

        // Calculate ahead/behind counts
        let (commits_ahead, commits_behind) = main_repo.graph_ahead_behind(head_commit.id(), base_commit.id())?;

        // Check if branch is up to date
        let up_to_date = commits_ahead == 0 && commits_behind == 0;

        // Check if branch is merged (simplified check - if HEAD is reachable from base)
        let merged = commits_ahead == 0;

        // Check for uncommitted changes
        let statuses = worktree_repo.statuses(None)?;
        let has_uncommitted_changes = !statuses.is_empty();

        Ok(BranchStatus {
            is_behind: commits_behind > 0,
            commits_behind,
            commits_ahead,
            up_to_date,
            merged,
            has_uncommitted_changes,
            base_branch_name: base_branch_name.to_string(),
        })
    }

    /// Get the default branch name for the repository
    pub fn get_default_branch_name(&self) -> Result<String, GitServiceError> {
        let repo = self.open_repo()?;
        
        let result = match repo.head() {
            Ok(head_ref) => Ok(head_ref.shorthand().unwrap_or("main").to_string()),
            Err(e) if e.class() == git2::ErrorClass::Reference 
                && e.code() == git2::ErrorCode::UnbornBranch => {
                Ok("main".to_string()) // Repository has no commits yet
            }
            Err(_) => Ok("main".to_string()), // Fallback
        };
        result
    }

    /// Check if a branch exists in the repository
    pub fn branch_exists(&self, branch_name: &str) -> Result<bool, GitServiceError> {
        let repo = self.open_repo()?;
        let result = match repo.find_branch(branch_name, BranchType::Local) {
            Ok(_) => Ok(true),
            Err(e) if e.code() == git2::ErrorCode::NotFound => Ok(false),
            Err(e) => Err(e.into()),
        };
        result
    }

    /// Remove a worktree (cleanup operation)
    pub fn remove_worktree(&self, worktree_name: &str) -> Result<(), GitServiceError> {
        let repo = self.open_repo()?;
        
        // Find and remove the worktree
        if let Ok(worktree) = repo.find_worktree(worktree_name) {
            // Try to prune the worktree directly
            worktree.prune(None)?;
            info!("Removed worktree: {}", worktree_name);
        } else {
            debug!("Worktree {} not found, nothing to remove", worktree_name);
        }

        Ok(())
    }

    /// Check if the repository has any uncommitted changes
    pub fn has_uncommitted_changes(&self, worktree_path: &Path) -> Result<bool, GitServiceError> {
        let repo = Repository::open(worktree_path)?;
        let statuses = repo.statuses(None)?;
        Ok(!statuses.is_empty())
    }

    /// Get the repository path
    pub fn repo_path(&self) -> &Path {
        &self.repo_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_repo() -> (TempDir, Repository) {
        let temp_dir = TempDir::new().unwrap();
        let repo = Repository::init(temp_dir.path()).unwrap();
        
        // Configure the repository
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();
        
        (temp_dir, repo)
    }

    #[test]
    fn test_git_service_creation() {
        let (temp_dir, _repo) = create_test_repo();
        let git_service = GitService::new(temp_dir.path()).unwrap();
        assert_eq!(git_service.repo_path(), temp_dir.path());
    }

    #[test]
    fn test_invalid_repository_path() {
        let result = GitService::new("/nonexistent/path");
        assert!(result.is_err());
    }

    #[test]
    fn test_default_branch_name() {
        let (temp_dir, _repo) = create_test_repo();
        let git_service = GitService::new(temp_dir.path()).unwrap();
        let branch_name = git_service.get_default_branch_name().unwrap();
        assert_eq!(branch_name, "main");
    }
}
