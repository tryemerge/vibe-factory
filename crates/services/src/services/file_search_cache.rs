use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use dashmap::DashMap;
use ignore::WalkBuilder;
use once_cell::sync::Lazy;
use tokio::task;

/// Metadata for a cached file entry
#[derive(Debug, Clone)]
pub struct FileMeta {
    /// Relative path from repo root
    pub path: String,
    /// Whether this is a file (true) or directory (false)
    pub is_file: bool,
    /// Pre-computed lowercase path for fast searching
    pub lower: String,
}

impl FileMeta {
    fn new(path: String, is_file: bool) -> Self {
        let lower = path.to_lowercase();
        Self { path, is_file, lower }
    }
}

/// Cache entry containing file list and metadata
#[derive(Debug, Clone)]
struct FileListCache {
    /// Immutable file list snapshot
    files: Arc<Vec<FileMeta>>,
    /// When this cache entry was generated
    generated_at: Instant,
}

/// Global cache for file search results per repository
static FILE_LIST_CACHE: Lazy<DashMap<PathBuf, FileListCache>> = Lazy::new(DashMap::new);

/// Cache TTL in seconds - refresh if older than this
const CACHE_TTL_SECONDS: u64 = 600; // 10 minutes

/// Service for managing file search cache
pub struct FileSearchCache;

impl FileSearchCache {
    /// Get cached file list if available and not stale
    pub fn maybe_get(repo_path: &Path) -> Option<Arc<Vec<FileMeta>>> {
        let cache_entry = FILE_LIST_CACHE.get(repo_path)?;
        
        // Check if cache is stale
        let age = cache_entry.generated_at.elapsed();
        if age.as_secs() > CACHE_TTL_SECONDS {
            // Cache is stale, trigger async rebuild but return None
            // so caller uses fallback
            let repo_path = repo_path.to_path_buf();
            tokio::spawn(async move {
                Self::rebuild(repo_path).await;
            });
            return None;
        }
        
        Some(cache_entry.files.clone())
    }

    /// Ensure repository is indexed, triggering async build if needed
    pub async fn ensure_indexed(repo_path: &Path) {
        if !FILE_LIST_CACHE.contains_key(repo_path) {
            Self::rebuild(repo_path.to_path_buf()).await;
        }
    }

    /// Rebuild cache for a repository (runs in background thread)
    pub async fn rebuild(repo_path: PathBuf) {
        tracing::info!("Building file search cache for: {}", repo_path.display());
        
        let start = Instant::now();
        let repo_path_for_closure = repo_path.clone();
        
        // Run filesystem walk in blocking thread pool
        let files = match task::spawn_blocking(move || Self::walk_repository(&repo_path_for_closure)).await {
            Ok(Ok(files)) => files,
            Ok(Err(e)) => {
                tracing::error!("Failed to walk repository {}: {}", repo_path.display(), e);
                return;
            }
            Err(e) => {
                tracing::error!("Task join error for {}: {}", repo_path.display(), e);
                return;
            }
        };

        let cache_entry = FileListCache {
            files: Arc::new(files),
            generated_at: Instant::now(),
        };

        FILE_LIST_CACHE.insert(repo_path.clone(), cache_entry);
        
        let elapsed = start.elapsed();
        tracing::info!(
            "Completed file search cache for {} ({} files in {:?})", 
            repo_path.display(), 
            FILE_LIST_CACHE.get(&repo_path).map(|c| c.files.len()).unwrap_or(0),
            elapsed
        );
    }

    /// Remove cache entry for a repository
    pub fn invalidate(repo_path: &Path) {
        FILE_LIST_CACHE.remove(repo_path);
        tracing::debug!("Invalidated file search cache for: {}", repo_path.display());
    }

    /// Walk repository filesystem and collect file metadata
    fn walk_repository(repo_path: &Path) -> Result<Vec<FileMeta>, Box<dyn std::error::Error + Send + Sync>> {
        if !repo_path.exists() {
            return Err(format!("Repository path does not exist: {}", repo_path.display()).into());
        }

        let mut files = Vec::new();

        // Use same walker configuration as original search
        let walker = WalkBuilder::new(repo_path)
            .git_ignore(false)
            .git_global(false)
            .git_exclude(false)
            .hidden(false)
            .build();

        for result in walker {
            let entry = result?;
            let path = entry.path();

            // Skip the root directory itself
            if path == repo_path {
                continue;
            }

            let relative_path = path.strip_prefix(repo_path)?;

            // Skip .git directory and its contents
            if relative_path
                .components()
                .any(|c| c.as_os_str() == ".git")
            {
                continue;
            }

            // Skip some known large directories to keep memory usage reasonable
            let should_skip = relative_path
                .components()
                .any(|c| {
                    let name = c.as_os_str().to_string_lossy();
                    matches!(name.as_ref(), 
                        "node_modules" | "target" | "dist" | "build" | 
                        ".next" | ".nuxt" | "coverage" | ".nyc_output"
                    )
                });

            if should_skip {
                continue;
            }

            let relative_path_str = relative_path.to_string_lossy().to_string();
            let is_file = path.is_file();

            files.push(FileMeta::new(relative_path_str, is_file));
        }

        // Sort files for consistent results
        files.sort_by(|a, b| a.path.cmp(&b.path));

        Ok(files)
    }

    /// Get cache statistics for debugging
    pub fn stats() -> (usize, usize) {
        let cache_entries = FILE_LIST_CACHE.len();
        let total_files = FILE_LIST_CACHE
            .iter()
            .map(|entry| entry.files.len())
            .sum();
        (cache_entries, total_files)
    }
}
